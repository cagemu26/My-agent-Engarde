"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// MediaPipe pose connections
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Upper body
  [11, 23], [12, 24], [23, 24], // Torso
  [23, 25], [25, 27], [24, 26], [26, 28], // Legs
  [0, 11], [0, 12], // Head to shoulders
];

// Key point names for labeling
const KEY_POINT_NAMES: Record<number, string> = {
  0: "Nose", 11: "L.Shoulder", 12: "R.Shoulder",
  13: "L.Elbow", 14: "R.Elbow", 15: "L.Wrist", 16: "R.Wrist",
  23: "L.Hip", 24: "R.Hip", 25: "L.Knee", 26: "R.Knee",
  27: "L.Ankle", 28: "R.Ankle",
};

// Demo video ID with pose data
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Set canvas size to match video
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frame = poseData.pose_sequence[currentFrame];
    if (!frame || !frame.landmarks) return;

    // Draw skeleton
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#FF6B35';

    // Draw connections
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

    // Draw key points
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

          // Draw label for major points
          if (['Nose', 'L.Shoulder', 'R.Shoulder', 'L.Hip', 'R.Hip'].includes(name)) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '12px sans-serif';
            ctx.fillText(name, x + 8, y - 8);
            ctx.fillStyle = '#FF6B35';
          }
        }
      }
    });

    // Draw frame counter
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, canvas.height - 30, 120, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px monospace';
    ctx.fillText(`Frame: ${currentFrame}/${poseData.pose_sequence.length - 1}`, 18, canvas.height - 14);
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
            <Link href="/analyze" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
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
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">See Engarde AI in Action</h1>
            <p className="text-muted-foreground">
              Watch how our AI analyzes fencing technique in real-time with pose detection
            </p>
          </div>

          {/* Video Player with Skeleton Overlay */}
          <div className="aspect-video rounded-2xl bg-card border border-border overflow-hidden mb-8 relative">
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              controls
              preload="metadata"
            >
              <source src={`http://localhost:8000/video/${DEMO_VIDEO_ID}`} type="video/mp4" />
              Your browser does not support the video tag.
            </video>

            {/* Skeleton Canvas Overlay */}
            {showOverlay && (
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
              />
            )}

            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-muted-foreground">Loading pose data...</p>
                </div>
              </div>
            )}

            {/* Overlay Toggle - moved to top to avoid conflict with video controls */}
            <div className="absolute top-4 left-4 z-10">
              <button
                onClick={() => setShowOverlay(!showOverlay)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  showOverlay
                    ? "bg-green-500 text-white"
                    : "bg-black/70 text-white hover:bg-black/90"
                }`}
              >
                {showOverlay ? "Hide Skeleton" : "Show Skeleton"}
              </button>
            </div>

            {/* Legend - moved to top right to avoid conflict with video controls */}
            {showOverlay && (
              <div className="absolute top-4 right-4 z-10 bg-black/70 rounded-lg p-3 text-xs text-white">
                <p className="font-medium mb-1">Pose Keypoints:</p>
                <div className="flex gap-3">
                  <span>🟢 Joints</span>
                  <span>🟠 Head/Shoulders/Hips</span>
                </div>
              </div>
            )}
          </div>

          {/* Demo Info */}
          <div className="bg-card border border-border rounded-xl p-6 mb-8">
            <h3 className="font-semibold mb-4">About This Demo</h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Video ID:</p>
                <p className="font-mono text-xs">{DEMO_VIDEO_ID}</p>
              </div>
              {poseData && (
                <>
                  <div>
                    <p className="text-muted-foreground">Total Frames:</p>
                    <p>{poseData.video_properties.frame_count}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">FPS:</p>
                    <p>{poseData.video_properties.fps}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Pose Keypoints:</p>
                    <p>33 (MediaPipe)</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Features Demo */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-card border border-border">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Pose Detection</h3>
              <p className="text-sm text-muted-foreground">
                Our AI tracks 33 key points on your body using MediaPipe to analyze stance, footwork, and movement patterns.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-card border border-border">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Real-time Feedback</h3>
              <p className="text-sm text-muted-foreground">
                Get instant insights on timing, distance, and technique as you train.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-card border border-border">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Detailed Reports</h3>
              <p className="text-sm text-muted-foreground">
                Receive comprehensive AI-generated reports with actionable recommendations.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-card border border-border">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">AI Coach Chat</h3>
              <p className="text-sm text-muted-foreground">
                Chat with our AI fencing coach for personalized technique advice and training tips.
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center mt-12">
            <Link
              href="/analyze"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Try It Yourself
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
