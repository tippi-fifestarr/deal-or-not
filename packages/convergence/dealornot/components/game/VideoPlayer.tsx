"use client";

import { useRef, useEffect } from "react";

interface VideoPlayerProps {
  videoUrl: string | null;
  onEnded: () => void;
  onSkip?: () => void;
  showSkipButton?: boolean;
}

export default function VideoPlayer({
  videoUrl,
  onEnded,
  onSkip,
  showSkipButton = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(console.error);
    }
  }, [videoUrl]);

  if (!videoUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      <video
        ref={videoRef}
        key={videoUrl}
        autoPlay
        muted={false}
        playsInline
        onEnded={onEnded}
        className="max-w-full max-h-full"
      >
        <source src={videoUrl} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {showSkipButton && (
        <button
          onClick={onSkip || onEnded}
          className="absolute top-4 right-4 text-white/60 hover:text-white text-sm bg-black/50 px-4 py-2 rounded transition-colors"
        >
          Skip Video
        </button>
      )}
    </div>
  );
}
