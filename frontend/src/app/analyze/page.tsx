"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PoseAnalysisResult {
  video_id: string;
  message: string;
  pose_data_path: string;
  processed_frames: number;
  total_frames: number;
}

interface VideoFile {
  id?: string;
  file: File;
  name: string;
  size: number;
  status: "pending" | "uploading" | "processing" | "complete" | "error";
  progress: number;
  weapon?: string;
  analysisDepth?: number;
}

type AnalysisMode = "pose" | "action";

const ANALYSIS_MODES = [
  { value: "pose", label: "Pose Detection (姿态检测)", description: "MediaPipe skeleton overlay", icon: "骨骼" },
  { value: "action", label: "Action Recognition (动作识别)", description: "CNN-based action detection (Coming Soon)", icon: "动作" },
];

const WEAPON_TYPES = [
  { value: "foil", label: "Foil (花剑)", color: "#FF6B35" },
  { value: "epee", label: "Épée (重剑)", color: "#8B5CF6" },
  { value: "sabre", label: "Sabre (佩剑)", color: "#06B6D4" },
];

const ANALYSIS_DEPTHS = [
  { value: 1, label: "Basic - Footwork Only" },
  { value: 2, label: "Basic + Blade Work" },
  { value: 3, label: "Standard - Full Technique" },
  { value: 4, label: "Advanced - Tactical Analysis" },
  { value: 5, label: "Expert - Complete Analysis" },
];

interface VideoMetadata {
  title: string;
  athlete: string;
  opponent: string;
  matchResult: string;
  score: string;
  tournament: string;
}

export default function Analyze() {
  const [activeTab, setActiveTab] = useState<"analyze" | "chat">("analyze");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm your fencing AI coach. Ask me anything about technique, training, or analyze your videos. How can I help you today?" }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [videoFile, setVideoFile] = useState<VideoFile | null>(null);
  const [selectedWeapon, setSelectedWeapon] = useState("epee");
  const [selectedDepth, setSelectedDepth] = useState(3);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("pose");
  const [poseResult, setPoseResult] = useState<PoseAnalysisResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [metadata, setMetadata] = useState<VideoMetadata>({
    title: "",
    athlete: "",
    opponent: "",
    matchResult: "",
    score: "",
    tournament: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB - must match backend

  const validateFile = (file: File): boolean => {
    const allowedTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
    return allowedTypes.includes(file.type) && file.size <= MAX_FILE_SIZE;
  };

  const handleFileSelect = (file: File) => {
    if (!validateFile(file)) {
      alert(`Invalid file. Please upload MP4, MOV, AVI, or WebM files under ${MAX_FILE_SIZE / (1024*1024)}MB.`);
      return;
    }
    setVideoFile({
      file,
      name: file.name,
      size: file.size,
      status: "pending",
      progress: 0,
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!videoFile) return;

    setVideoFile(prev => prev ? { ...prev, status: "uploading", progress: 10 } : null);

    try {
      // Step 1: Upload video with metadata
      const formData = new FormData();
      formData.append("file", videoFile.file);
      formData.append("title", metadata.title || videoFile.name);
      formData.append("athlete", metadata.athlete);
      formData.append("opponent", metadata.opponent);
      formData.append("weapon", selectedWeapon);
      formData.append("match_result", metadata.matchResult);
      formData.append("score", metadata.score);
      formData.append("tournament", metadata.tournament);

      const uploadResponse = await fetch("http://localhost:8000/video/upload-with-metadata", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      const uploadData = await uploadResponse.json();
      setVideoFile(prev => prev ? { ...prev, progress: 50, id: uploadData.video_id } : null);

      // Step 2: Analyze video based on selected mode
      setVideoFile(prev => prev ? { ...prev, status: "processing", progress: 60 } : null);

      let analyzeData: PoseAnalysisResult;
      if (analysisMode === "pose") {
        // Pose Detection Mode - call pose analysis API
        const analyzeResponse = await fetch("http://localhost:8000/video/analyze/pose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_id: uploadData.video_id,
          }),
        });

        if (!analyzeResponse.ok) {
          throw new Error("Pose analysis failed");
        }

        analyzeData = await analyzeResponse.json();
        setPoseResult(analyzeData);

        // Generate LLM pose analysis report
        let reportMessage = `Pose analysis complete! Generated skeleton overlay video and extracted ${analyzeData.total_frames} frames of pose data.`;

        try {
          const reportResponse = await fetch(`http://localhost:8000/video/${uploadData.video_id}/analyze/pose/report`, {
            method: "POST",
          });

          if (reportResponse.ok) {
            const reportData = await reportResponse.json();
            if (reportData.report) {
              reportMessage = reportData.report;
            }
          }
        } catch (reportError) {
          console.error("Failed to generate pose report:", reportError);
        }

        // Add pose analysis result to chat
        const videoTitle = metadata.title || videoFile.name;
        setMessages(prev => [...prev,
          { role: "user", content: `Pose Analysis: ${videoTitle}` },
          { role: "assistant", content: reportMessage }
        ]);
      } else {
        // Action Recognition Mode - Reserved for CNN model
        const analyzeResponse = await fetch("http://localhost:8000/video/analyze/cnn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_id: uploadData.video_id,
            weapon: selectedWeapon,
            depth: selectedDepth,
          }),
        });

        // For now, return a placeholder message since CNN is not implemented
        if (!analyzeResponse.ok) {
          // Return placeholder for reserved feature
          const videoTitle = metadata.title || videoFile.name;
          setMessages(prev => [...prev,
            { role: "user", content: `Action Recognition: ${videoTitle}` },
            { role: "assistant", content: "Action Recognition feature is coming soon! This will use CNN-based models to detect specific fencing actions like attacks, parries, and ripostes." }
          ]);
          setVideoFile(prev => prev ? { ...prev, status: "complete", progress: 100 } : null);
          setActiveTab("chat");
          return;
        }

        analyzeData = await analyzeResponse.json();
      }

      setVideoFile(prev => prev ? { ...prev, status: "complete", progress: 100 } : null);
      setActiveTab("chat");

    } catch (error) {
      console.error("Upload error:", error);
      setVideoFile(prev => prev ? { ...prev, status: "error", progress: 0 } : null);
    }
  };

  const handleRemoveVideo = () => {
    setVideoFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsTyping(true);

    try {
      // Only send last 10 messages to avoid token limit issues
      const recentMessages = [...messages, { role: "user", content: userMessage }].slice(-10);

      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: recentMessages.map(m => ({
            role: m.role,
            content: m.content
          }))
        }),
      });

      const data = await response.json();
      setIsTyping(false);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.message
      }]);
    } catch {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again."
      }]);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">E</span>
            </div>
            <span className="font-semibold text-lg">Engarde AI</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/analyze" className="text-sm text-primary font-medium">
              Analyze
            </Link>
            <Link href="/training" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Training
            </Link>
            <Link href="/history" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              History
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">Fencing Analysis</h1>
            <p className="text-muted-foreground">
              Analyze your videos or chat with AI about fencing technique
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-8 p-1 bg-card rounded-xl border border-border w-fit mx-auto">
            <button
              onClick={() => setActiveTab("analyze")}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "analyze"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Video Analysis
              </span>
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "chat"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                AI Coach
              </span>
            </button>
          </div>

          {/* Video Analysis Tab */}
          {activeTab === "analyze" && (
            <div className="space-y-6">
              {/* Upload Area */}
              {!videoFile ? (
                <div
                  className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Drop your video here</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    or click to browse files
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supports MP4, MOV, AVI • Max 500MB
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </div>
              ) : (
                <div className="border border-border rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">{videoFile.name}</p>
                        <p className="text-sm text-muted-foreground">{formatFileSize(videoFile.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleRemoveVideo}
                      className="p-2 rounded-lg hover:bg-secondary transition-colors"
                    >
                      <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Progress Bar */}
                  {(videoFile.status === "uploading" || videoFile.status === "processing") && (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">
                          {videoFile.status === "uploading" ? "Uploading..." : "Analyzing..."}
                        </span>
                        <span>{videoFile.progress}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${videoFile.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Status Badge */}
                  {videoFile.status === "complete" && (
                    <div className="mb-4 space-y-2">
                      <div className="p-3 rounded-lg bg-green-500/10 text-green-500 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {analysisMode === "pose" ? "Pose Analysis Complete" : "Analysis Complete"}
                      </div>

                      {/* Pose Analysis Results */}
                      {analysisMode === "pose" && poseResult && (
                        <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                          <h4 className="font-medium text-sm">Pose Analysis Results</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {poseResult.total_frames && (
                              <>
                                <div className="p-2 rounded-lg bg-secondary">
                                  <span className="text-muted-foreground">Total Frames:</span> {poseResult.total_frames}
                                </div>
                                <div className="p-2 rounded-lg bg-secondary">
                                  <span className="text-muted-foreground">Processed:</span> {poseResult.processed_frames}
                                </div>
                              </>
                            )}
                            {poseResult.pose_data_path && (
                              <div className="col-span-2 p-2 rounded-lg bg-secondary text-center text-muted-foreground text-xs">
                                Pose data saved: {poseResult.pose_data_path.split('/').pop()}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <a
                              href={`http://localhost:8000/video/${videoFile?.id}/pose-overlay`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 p-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-center text-sm"
                            >
                              View Skeleton Overlay Video
                            </a>
                            <a
                              href={`http://localhost:8000/video/${videoFile?.id}/pose-data`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-center text-sm"
                            >
                              View Pose Data
                            </a>
                            <a
                              href={`http://localhost:8000/video/${videoFile?.id}/pose-metrics`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-center text-sm"
                            >
                              View Metrics
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {videoFile.status === "error" && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Upload failed. Please try again.
                    </div>
                  )}
                </div>
              )}

              {/* Analysis Mode Selector */}
              <div className="p-6 rounded-xl bg-card border border-border">
                <h4 className="font-medium mb-4">Analysis Mode (分析模式)</h4>
                <div className="grid md:grid-cols-2 gap-3">
                  {ANALYSIS_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setAnalysisMode(mode.value as AnalysisMode)}
                      disabled={mode.value === "action"}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        analysisMode === mode.value
                          ? "border-primary bg-primary/5"
                          : mode.value === "action"
                          ? "border-border/50 opacity-60 cursor-not-allowed"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                          analysisMode === mode.value ? "bg-primary text-primary-foreground" : "bg-secondary"
                        }`}>
                          {mode.icon}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{mode.label}</p>
                          <p className="text-xs text-muted-foreground">{mode.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h4 className="font-medium mb-2">Weapon Type (剑种)</h4>
                  <select
                    value={selectedWeapon}
                    onChange={(e) => setSelectedWeapon(e.target.value)}
                    className="w-full p-2 rounded-lg bg-background border border-border text-sm"
                  >
                    {WEAPON_TYPES.map((weapon) => (
                      <option key={weapon.value} value={weapon.value}>
                        {weapon.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border">
                  <h4 className="font-medium mb-2">Analysis Depth (分析深度)</h4>
                  <select
                    value={selectedDepth}
                    onChange={(e) => setSelectedDepth(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-background border border-border text-sm"
                  >
                    {ANALYSIS_DEPTHS.map((depth) => (
                      <option key={depth.value} value={depth.value}>
                        {depth.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Metadata Form Toggle */}
              <button
                onClick={() => setShowMetadataForm(!showMetadataForm)}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <svg className={`w-4 h-4 transition-transform ${showMetadataForm ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {showMetadataForm ? "Hide" : "Show"} match details (optional)
              </button>

              {/* Metadata Form */}
              {showMetadataForm && (
                <div className="p-6 rounded-xl bg-card border border-border space-y-4">
                  <h4 className="font-medium">Match Details (比赛信息)</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">Title (标题)</label>
                      <input
                        type="text"
                        value={metadata.title}
                        onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                        placeholder="e.g., 2024 Regional Championship Final"
                        className="w-full p-2 rounded-lg bg-background border border-border text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">Athlete (运动员)</label>
                      <input
                        type="text"
                        value={metadata.athlete}
                        onChange={(e) => setMetadata({ ...metadata, athlete: e.target.value })}
                        placeholder="Your name"
                        className="w-full p-2 rounded-lg bg-background border border-border text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">Opponent (对手)</label>
                      <input
                        type="text"
                        value={metadata.opponent}
                        onChange={(e) => setMetadata({ ...metadata, opponent: e.target.value })}
                        placeholder="Opponent's name"
                        className="w-full p-2 rounded-lg bg-background border border-border text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">Tournament (赛事)</label>
                      <input
                        type="text"
                        value={metadata.tournament}
                        onChange={(e) => setMetadata({ ...metadata, tournament: e.target.value })}
                        placeholder="e.g., National Championships"
                        className="w-full p-2 rounded-lg bg-background border border-border text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">Match Result (比赛结果)</label>
                      <select
                        value={metadata.matchResult}
                        onChange={(e) => setMetadata({ ...metadata, matchResult: e.target.value })}
                        className="w-full p-2 rounded-lg bg-background border border-border text-sm"
                      >
                        <option value="">Select result</option>
                        <option value="win">Win (胜)</option>
                        <option value="loss">Loss (负)</option>
                        <option value="draw">Draw (平)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-1">Score (比分)</label>
                      <input
                        type="text"
                        value={metadata.score}
                        onChange={(e) => setMetadata({ ...metadata, score: e.target.value })}
                        placeholder="e.g., 15-12"
                        className="w-full p-2 rounded-lg bg-background border border-border text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleUpload}
                disabled={!videoFile || videoFile.status === "uploading" || videoFile.status === "processing"}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {videoFile?.status === "uploading" ? "Uploading..." :
                 videoFile?.status === "processing" ? "Analyzing..." :
                 videoFile ? "Start Analysis" : "Select a video to start"}
              </button>

              {/* Recent Analyses */}
              <div className="mt-8">
                <h2 className="text-lg font-semibold mb-4">Recent Analyses</h2>
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                        <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">Training Session #23</p>
                        <p className="text-sm text-muted-foreground">Foil • 2 hours ago</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-sm">
                      Complete
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Chat Tab */}
          {activeTab === "chat" && (
            <div className="flex flex-col h-[600px]">
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-card rounded-2xl border border-border mb-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] p-4 rounded-2xl ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-secondary p-4 rounded-2xl">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Questions */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <button onClick={() => setInput("How to improve my lunge?")} className="px-3 py-1 text-xs bg-secondary rounded-full hover:bg-secondary/80 transition-colors">
                  How to improve my lunge?
                </button>
                <button onClick={() => setInput("What are common footwork mistakes?")} className="px-3 py-1 text-xs bg-secondary rounded-full hover:bg-secondary/80 transition-colors">
                  Footwork mistakes
                </button>
                <button onClick={() => setInput("How to defend against attacks?")} className="px-3 py-1 text-xs bg-secondary rounded-full hover:bg-secondary/80 transition-colors">
                  Defensive techniques
                </button>
                <button onClick={() => setInput("What's a good training routine?")} className="px-3 py-1 text-xs bg-secondary rounded-full hover:bg-secondary/80 transition-colors">
                  Training routine
                </button>
              </div>

              {/* Input */}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask about fencing technique, training tips..."
                  className="flex-1 p-4 rounded-xl bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
