"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [0, 11], [0, 12],
];

const KEY_POINT_NAMES: Record<number, string> = {
  0: "Nose", 11: "L.Shoulder", 12: "R.Shoulder",
  13: "L.Elbow", 14: "R.Elbow", 15: "L.Wrist", 16: "R.Wrist",
  23: "L.Hip", 24: "R.Hip", 25: "L.Knee", 26: "R.Knee",
  27: "L.Ankle", 28: "R.Ankle",
};

const DEMO_VIDEO_ID = "3f7c31ce-f491-4e0f-b787-2f8a57d58560";

interface PoseFrame {
  frame_index: number;
  landmarks: Array<{ x: number; y: number; z: number; visibility: number }>;
}

interface PoseData {
  pose_sequence: PoseFrame[];
  video_properties: {
    width: number;
    height: number;
    fps: number;
    frame_count: number;
  };
}

export default function Demo() {
  const [showOverlay, setShowOverlay] = useState(false);
  const [poseData, setPoseData] = useState<PoseData | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetchPoseData();
  }, []);

  useEffect(() => {
    if (showOverlay && poseData && videoRef.current) {
      const video = videoRef.current;
      const handleTimeUpdate = () => {
        if (poseData && poseData.video_properties.fps) {
          const frame = Math.floor(video.currentTime * poseData.video_properties.fps);
          const maxFrame = Math.min(frame, poseData.pose_sequence.length - 1);
          setCurrentFrame(maxFrame >= 0 ? maxFrame : 0);
        }
      };
      video.addEventListener('timeupdate', handleTimeUpdate);
      return () => video.removeEventListener('timeupdate', handleTimeUpdate);
    }
  }, [showOverlay, poseData]);

  useEffect(() => {
    if (showOverlay && poseData && canvasRef.current && currentFrame < poseData.pose_sequence.length) {
      drawSkeleton();
    }
  }, [showOverlay, currentFrame, poseData]);

  const fetchPoseData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/video/${DEMO_VIDEO_ID}/pose-data`);
      if (response.ok) {
        const data = await response.json();
        setPoseData(data);
      }
    } catch (error) {
      console.error("Failed to fetch pose data:", error);
    } finally {
      setLoading(false);
    }
  };

  const drawSkeleton = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !poseData || currentFrame >= poseData.pose_sequence.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frame = poseData.pose_sequence[currentFrame];
    if (!frame || !frame.landmarks) return;

    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#FBBF24';

    POSE_CONNECTIONS.forEach(([i, j]) => {
      if (i < frame.landmarks.length && j < frame.landmarks.length) {
        const p1 = frame.landmarks[i];
        const p2 = frame.landmarks[j];
        if (p1.visibility > 0.3 && p2.visibility > 0.3) {
          ctx.beginPath();
          ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
          ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
          ctx.stroke();
        }
      }
    });

    Object.entries(KEY_POINT_NAMES).forEach(([idx, name]) => {
      const index = parseInt(idx);
      if (index < frame.landmarks.length) {
        const point = frame.landmarks[index];
        if (point.visibility > 0.3) {
          const x = point.x * canvas.width;
          const y = point.y * canvas.height;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, 2 * Math.PI);
          ctx.fill();
          if (['Nose', 'L.Shoulder', 'R.Shoulder', 'L.Hip', 'R.Hip'].includes(name)) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(name, x + 10, y - 10);
            ctx.fillStyle = '#FBBF24';
          }
        }
      }
    });

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, canvas.height - 35, 140, 25);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px monospace';
    ctx.fillText(`Frame: ${currentFrame}/${poseData.pose_sequence.length - 1}`, 20, canvas.height - 17);
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
            <Link href="/analyze" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Analyze
            </Link>
            <Link href="/training" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              Training
            </Link>
            <Link href="/history" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hover-lift">
              History
            </Link>
            <Link href="/demo" className="text-sm font-medium text-red-600 hover-lift">
              Demo
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-32 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">See Engarde AI in Action</h1>
            <p className="text-muted-foreground text-lg">
              Watch how our AI analyzes fencing technique in real-time with pose detection
            </p>
          </div>

          {/* Video Player */}
          <div className="relative aspect-video rounded-3xl overflow-hidden mb-10 glass-card">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              controls
              preload="metadata"
            >
              <source src={`http://localhost:8000/video/${DEMO_VIDEO_ID}`} type="video/mp4" />
              Your browser does not support the video tag.
            </video>

            {showOverlay && (
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
              />
            )}

            {loading && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-muted-foreground">Loading pose data...</p>
                </div>
              </div>
            )}

            {/* Overlay Toggle */}
            <div className="absolute top-4 left-4 z-10">
              <button
                onClick={() => setShowOverlay(!showOverlay)}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
                  showOverlay
                    ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-500/30"
                    : "bg-black/70 text-white hover:bg-black/90"
                }`}
              >
                {showOverlay ? "🟢 Skeleton On" : "Show Skeleton"}
              </button>
            </div>

            {showOverlay && (
              <div className="absolute top-4 right-4 z-10 glass rounded-xl p-4 text-sm">
                <p className="font-semibold mb-2">Pose Keypoints:</p>
                <div className="space-y-1 text-muted-foreground">
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500"></span> Key Points</div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-600"></span> Connections</div>
                </div>
              </div>
            )}
          </div>

          {/* Video Info */}
          <div className="grid md:grid-cols-4 gap-4 mb-10">
            <div className="glass-card p-5 rounded-2xl text-center">
              <p className="text-sm text-muted-foreground mb-1">Total Frames</p>
              <p className="text-2xl font-bold text-red-600">{poseData?.video_properties?.frame_count || '—'}</p>
            </div>
            <div className="glass-card p-5 rounded-2xl text-center">
              <p className="text-sm text-muted-foreground mb-1">FPS</p>
              <p className="text-2xl font-bold text-amber-500">{poseData?.video_properties?.fps || '—'}</p>
            </div>
            <div className="glass-card p-5 rounded-2xl text-center">
              <p className="text-sm text-muted-foreground mb-1">Resolution</p>
              <p className="text-2xl font-bold">{poseData ? `${poseData.video_properties?.width}x${poseData.video_properties?.height}` : '—'}</p>
            </div>
            <div className="glass-card p-5 rounded-2xl text-center">
              <p className="text-sm text-muted-foreground mb-1">Keypoints</p>
              <p className="text-2xl font-bold text-red-600">33</p>
            </div>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="group glass-card p-8 rounded-3xl hover-lift transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center mb-5 shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Pose Detection</h3>
              <p className="text-muted-foreground">
                Our AI tracks 33 key points on your body using MediaPipe to analyze stance, footwork, and movement patterns.
              </p>
            </div>
            <div className="group glass-card p-8 rounded-3xl hover-lift transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-5 shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Real-time Feedback</h3>
              <p className="text-muted-foreground">
                Get instant insights on timing, distance, and technique as you train.
              </p>
            </div>
            <div className="group glass-card p-8 rounded-3xl hover-lift transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center mb-5 shadow-lg shadow-red-500/30 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Detailed Reports</h3>
              <p className="text-muted-foreground">
                Receive comprehensive AI-generated reports with actionable recommendations.
              </p>
            </div>
            <div className="group glass-card p-8 rounded-3xl hover-lift transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mb-5 shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">AI Coach Chat</h3>
              <p className="text-muted-foreground">
                Chat with our AI fencing coach for personalized technique advice and training tips.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mt-12">
            <Link
              href="/analyze"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold text-lg hover:shadow-2xl hover:shadow-red-500/30 hover-lift transition-all duration-300"
            >
              Try It Yourself
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
