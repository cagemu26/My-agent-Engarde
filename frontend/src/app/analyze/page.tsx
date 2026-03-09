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
  { value: "pose", label: "Pose Detection", description: "MediaPipe skeleton overlay", icon: "🦴" },
  { value: "action", label: "Action Recognition", description: "CNN-based detection (Coming Soon)", icon: "🎯" },
];

const WEAPON_TYPES = [
  { value: "foil", label: "Foil", color: "#F97316", bg: "bg-orange-500" },
  { value: "epee", label: "Épée", color: "#DC2626", bg: "bg-red-600" },
  { value: "sabre", label: "Sabre", color: "#06B6D4", bg: "bg-cyan-500" },
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

  const MAX_FILE_SIZE = 100 * 1024 * 1024;

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

      setVideoFile(prev => prev ? { ...prev, status: "processing", progress: 60 } : null);

      let analyzeData: PoseAnalysisResult;
      if (analysisMode === "pose") {
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

        const videoTitle = metadata.title || videoFile.name;
        setMessages(prev => [...prev,
          { role: "user", content: `Pose Analysis: ${videoTitle}` },
          { role: "assistant", content: reportMessage }
        ]);
      } else {
        const analyzeResponse = await fetch("http://localhost:8000/video/analyze/cnn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_id: uploadData.video_id,
            weapon: selectedWeapon,
            depth: selectedDepth,
          }),
        });

        if (!analyzeResponse.ok) {
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

  const getWeaponStyle = (weapon: string) => {
    return WEAPON_TYPES.find(w => w.value === weapon) || WEAPON_TYPES[1];
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-red-500/5 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[80px]"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-105 transition-transform duration-300">
              <span className="text-white font-bold text-lg">E</span>
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight">Engarde</span>
              <span className="font-bold text-xl text-red-600">AI</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/analyze" className="text-sm font-medium text-red-600 hover-lift">
              Analyze
            </Link>
            <Link href="/training" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Training
            </Link>
            <Link href="/history" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              History
            </Link>
            <Link href="/demo" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Demo
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Fencing Analysis</h1>
            <p className="text-muted-foreground text-lg">
              Analyze your videos or chat with AI about fencing technique
            </p>
          </div>

          {/* Tabs */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex gap-1 p-1.5 bg-muted rounded-2xl">
              <button
                onClick={() => setActiveTab("analyze")}
                className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  activeTab === "analyze"
                    ? "bg-background shadow-lg text-red-600"
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
                className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  activeTab === "chat"
                    ? "bg-background shadow-lg text-red-600"
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
          </div>

          {/* Video Analysis Tab */}
          {activeTab === "analyze" && (
            <div className="space-y-8">
              {/* Upload Area */}
              {!videoFile ? (
                <div
                  className={`relative overflow-hidden border-2 border-dashed rounded-3xl p-16 text-center transition-all duration-300 cursor-pointer ${
                    isDragging
                      ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                      : "border-border hover:border-red-300 dark:hover:border-red-700"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {/* Background gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-red-50/50 to-amber-50/50 dark:from-red-900/10 dark:to-amber-900/10 opacity-50"></div>

                  <div className="relative">
                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-100 to-amber-100 dark:from-red-900/30 dark:to-amber-900/30 flex items-center justify-center">
                      <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold mb-3">Drop your video here</h3>
                    <p className="text-muted-foreground mb-2">
                      or click to browse files
                    </p>
                    <p className="text-sm text-muted-foreground/70">
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
                </div>
              ) : (
                <div className="glass-card rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl ${getWeaponStyle(selectedWeapon).bg} flex items-center justify-center shadow-lg`}>
                        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-lg">{videoFile.name}</p>
                        <p className="text-sm text-muted-foreground">{formatFileSize(videoFile.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleRemoveVideo}
                      className="p-3 rounded-xl hover:bg-secondary transition-colors"
                    >
                      <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Progress Bar */}
                  {(videoFile.status === "uploading" || videoFile.status === "processing") && (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground font-medium">
                          {videoFile.status === "uploading" ? "Uploading..." : "Analyzing..."}
                        </span>
                        <span className="font-semibold text-red-600">{videoFile.progress}%</span>
                      </div>
                      <div className="h-3 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-red-500 to-amber-500 rounded-full transition-all duration-500"
                          style={{ width: `${videoFile.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Status Badge */}
                  {videoFile.status === "complete" && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-2xl bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 flex items-center gap-3">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-medium">{analysisMode === "pose" ? "Pose Analysis Complete" : "Analysis Complete"}</span>
                      </div>

                      {/* Pose Analysis Results */}
                      {analysisMode === "pose" && poseResult && (
                        <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
                          <h4 className="font-semibold">Pose Analysis Results</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {poseResult.total_frames && (
                              <>
                                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
                                  <p className="text-xs text-muted-foreground">Total Frames</p>
                                  <p className="text-lg font-bold text-red-600">{poseResult.total_frames}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
                                  <p className="text-xs text-muted-foreground">Processed</p>
                                  <p className="text-lg font-bold text-amber-600">{poseResult.processed_frames}</p>
                                </div>
                              </>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <a
                              href={`http://localhost:8000/video/${videoFile?.id}/pose-overlay`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 min-w-[200px] p-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white text-center font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all hover-lift"
                            >
                              View Skeleton Overlay
                            </a>
                            <a
                              href={`http://localhost:8000/video/${videoFile?.id}/pose-data`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 min-w-[200px] p-3 rounded-xl bg-secondary text-center font-medium hover:bg-secondary/80 transition-colors"
                            >
                              View Pose Data
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {videoFile.status === "error" && (
                    <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-600 flex items-center gap-3">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Upload failed. Please try again.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Analysis Options */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Analysis Mode */}
                <div className="glass-card p-6 rounded-3xl">
                  <h4 className="font-semibold mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Analysis Mode
                  </h4>
                  <div className="space-y-3">
                    {ANALYSIS_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        onClick={() => setAnalysisMode(mode.value as AnalysisMode)}
                        disabled={mode.value === "action"}
                        className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                          analysisMode === mode.value
                            ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                            : mode.value === "action"
                            ? "border-border/50 opacity-60 cursor-not-allowed"
                            : "border-border hover:border-red-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{mode.icon}</span>
                          <div>
                            <p className="font-medium">{mode.label}</p>
                            <p className="text-xs text-muted-foreground">{mode.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-6">
                  {/* Weapon Type */}
                  <div className="glass-card p-6 rounded-3xl">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Weapon Type
                    </h4>
                    <div className="flex gap-3">
                      {WEAPON_TYPES.map((weapon) => (
                        <button
                          key={weapon.value}
                          onClick={() => setSelectedWeapon(weapon.value)}
                          className={`flex-1 p-3 rounded-xl border-2 transition-all ${
                            selectedWeapon === weapon.value
                              ? "border-transparent shadow-lg"
                              : "border-border hover:border-red-300"
                          }`}
                          style={{
                            backgroundColor: selectedWeapon === weapon.value ? weapon.color : undefined
                          }}
                        >
                          <span className={`font-medium ${selectedWeapon === weapon.value ? "text-white" : ""}`}>
                            {weapon.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Analysis Depth */}
                  <div className="glass-card p-6 rounded-3xl">
                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Analysis Depth
                    </h4>
                    <select
                      value={selectedDepth}
                      onChange={(e) => setSelectedDepth(Number(e.target.value))}
                      className="w-full p-3 rounded-xl bg-background border border-border"
                    >
                      {ANALYSIS_DEPTHS.map((depth) => (
                        <option key={depth.value} value={depth.value}>
                          {depth.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Metadata Form Toggle */}
              <button
                onClick={() => setShowMetadataForm(!showMetadataForm)}
                className="w-full p-4 rounded-2xl border border-dashed border-border hover:border-red-300 transition-colors flex items-center justify-center gap-2"
              >
                <svg className={`w-5 h-5 text-muted-foreground transition-transform ${showMetadataForm ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium">{showMetadataForm ? "Hide" : "Show"} match details (optional)</span>
              </button>

              {/* Metadata Form */}
              {showMetadataForm && (
                <div className="glass-card p-6 rounded-3xl space-y-6">
                  <h4 className="font-semibold text-lg">Match Details</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Title</label>
                      <input
                        type="text"
                        value={metadata.title}
                        onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                        placeholder="e.g., 2024 Regional Championship Final"
                        className="w-full p-3 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Athlete</label>
                      <input
                        type="text"
                        value={metadata.athlete}
                        onChange={(e) => setMetadata({ ...metadata, athlete: e.target.value })}
                        placeholder="Your name"
                        className="w-full p-3 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Opponent</label>
                      <input
                        type="text"
                        value={metadata.opponent}
                        onChange={(e) => setMetadata({ ...metadata, opponent: e.target.value })}
                        placeholder="Opponent's name"
                        className="w-full p-3 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Tournament</label>
                      <input
                        type="text"
                        value={metadata.tournament}
                        onChange={(e) => setMetadata({ ...metadata, tournament: e.target.value })}
                        placeholder="e.g., National Championships"
                        className="w-full p-3 rounded-xl bg-background border border-border"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Match Result</label>
                      <select
                        value={metadata.matchResult}
                        onChange={(e) => setMetadata({ ...metadata, matchResult: e.target.value })}
                        className="w-full p-3 rounded-xl bg-background border border-border"
                      >
                        <option value="">Select result</option>
                        <option value="win">Win</option>
                        <option value="loss">Loss</option>
                        <option value="draw">Draw</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-muted-foreground mb-2">Score</label>
                      <input
                        type="text"
                        value={metadata.score}
                        onChange={(e) => setMetadata({ ...metadata, score: e.target.value })}
                        placeholder="e.g., 15-12"
                        className="w-full p-3 rounded-xl bg-background border border-border"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleUpload}
                disabled={!videoFile || videoFile.status === "uploading" || videoFile.status === "processing"}
                className="w-full py-5 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold text-lg hover:shadow-2xl hover:shadow-red-500/30 hover-lift transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
              >
                {videoFile?.status === "uploading" ? "Uploading..." :
                 videoFile?.status === "processing" ? "Analyzing..." :
                 videoFile ? "Start Analysis" : "Select a video to start"}
              </button>
            </div>
          )}

          {/* AI Chat Tab */}
          {activeTab === "chat" && (
            <div className="flex flex-col h-[700px]">
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 glass-card rounded-3xl mb-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] p-5 rounded-2xl ${
                        message.role === "user"
                          ? "bg-gradient-to-r from-red-600 to-red-700 text-white"
                          : "bg-secondary"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-secondary p-5 rounded-2xl">
                      <div className="flex gap-2">
                        <span className="w-3 h-3 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                        <span className="w-3 h-3 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                        <span className="w-3 h-3 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Questions */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <button onClick={() => setInput("How to improve my lunge?")} className="px-4 py-2 text-sm bg-secondary rounded-full hover:bg-secondary/80 transition-colors">
                  How to improve my lunge?
                </button>
                <button onClick={() => setInput("What are common footwork mistakes?")} className="px-4 py-2 text-sm bg-secondary rounded-full hover:bg-secondary/80 transition-colors">
                  Footwork mistakes
                </button>
                <button onClick={() => setInput("How to defend against attacks?")} className="px-4 py-2 text-sm bg-secondary rounded-full hover:bg-secondary/80 transition-colors">
                  Defensive techniques
                </button>
                <button onClick={() => setInput("What's a good training routine?")} className="px-4 py-2 text-sm bg-secondary rounded-full hover:bg-secondary/80 transition-colors">
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
                  className="flex-1 p-5 rounded-2xl bg-card border border-border focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-lg"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="px-8 py-5 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold hover:shadow-lg hover:shadow-red-500/30 hover-lift transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
