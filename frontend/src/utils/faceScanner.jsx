import { useRef, useEffect, useState } from "react";
import * as faceapi from "face-api.js";
import React from "react";

function FaceScanner({ faceOn, onLoginSuccess, onClose }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [faceMatch, setFaceMatch] = useState(true);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState(null);

  useEffect(() => {
    let intervalId = null;

    // ------------------------------
    // Start Camera
    // ------------------------------
    const startVideo = () => {
      navigator.mediaDevices
        .getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 1280 },
          },
        })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onplaying = () => {
              console.log("✅ Video feed is live");
              if (!intervalId) {
                intervalId = setInterval(detectMyFace, 600);
              }
            };
          }
        })
        .catch((err) => console.error("❌ Camera permission denied:", err));
    };

    // ------------------------------
    // Stop Camera
    // ------------------------------
    const stopVideo = () => {
      console.log("🛑 Stopping camera...");

      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
        videoRef.current.srcObject = null;
        console.log("✅ Camera tracks stopped.");
      }

      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log("✅ Detection interval cleared.");
      }

      console.log("🧹 FaceScanner cleanup complete.");
    };

    // ------------------------------
    // Load FaceAPI Models
    // ------------------------------
    const loadModels = async () => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri("/models/face-api"),
        faceapi.nets.faceLandmark68Net.loadFromUri("/models/face-api"),
        faceapi.nets.faceRecognitionNet.loadFromUri("/models/face-api"),
        faceapi.nets.ssdMobilenetv1.loadFromUri("/models/face-api"),
      ]);
      console.log("✅ FaceAPI models loaded");
      setModelsLoaded(true);
    };

    // ------------------------------
    // Load Registered Users JSON
    // ------------------------------
    const loadRegisteredFaces = async () => {
      try {
        const res = await fetch("/models/face/users.json"); // your JSON path
        const data = await res.json();

        const labeledDescriptors = Object.entries(data).map(([userId, info]) => {
          return new faceapi.LabeledFaceDescriptors(
            userId, // label is the user ID
            [new Float32Array(info.faceDescriptor)]
          );
        });

        const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
        setFaceMatcher(matcher);
        console.log(`✅ Loaded ${labeledDescriptors.length} registered faces`);
      } catch (err) {
        console.error("❌ Failed to load registered faces:", err);
      }
    };

    // ------------------------------
    // Face Detection Loop
    // ------------------------------
    const detectMyFace = async () => {
      if (!videoRef.current || !canvasRef.current || !faceMatcher) return;

      const video = videoRef.current;
      if (!video.videoWidth || !video.videoHeight) return;

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();

      const canvas = canvasRef.current;
      const displaySize = { width: video.videoWidth, height: video.videoHeight };
      faceapi.matchDimensions(canvas, displaySize);

      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      faceapi.draw.drawDetections(canvas, resizedDetections);

      resizedDetections.forEach((det) => {
        const bestMatch = faceMatcher.findBestMatch(det.descriptor);

        if (bestMatch.label === "unknown") {
          setFaceMatch(false);
          console.log("❌ Face not recognized");
        } else {
          setFaceMatch(true);
          console.log(`✅ Matched: ${bestMatch.label}`);
          // 🔹 Trigger your login callback here
          if (onLoginSuccess) {
            onLoginSuccess(bestMatch.label); // send back user ID like "PDM-2023-003210"
          }
        }

        const box = det.detection.box;
        const drawBox = new faceapi.draw.DrawBox(box, {
          label:
            bestMatch.label === "unknown"
              ? "❌ Not Match"
              : `✅ ${bestMatch.label}`,
          boxColor: bestMatch.label === "unknown" ? "red" : "green",
        });
        drawBox.draw(canvas);
      });
    };

    // ------------------------------
    // Initialization
    // ------------------------------
    const init = async () => {
      console.log("Initializing Face Scanner...");
      await loadModels();
      await loadRegisteredFaces();
      startVideo();
    };

    if (faceOn) init();

    return () => {
      stopVideo();
    };
  }, [faceOn]);

  // ------------------------------
  // UI
  // ------------------------------
  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex flex-col items-center justify-center w-full p-2 h-fit">
        <h1 className="text-[clamp(1rem,2vw,3rem)] font-medium">Face Detection</h1>
        <p className="text-[clamp(0.5rem,1vw,1rem)] text-center">
          Scan your face to verify your identity
        </p>
      </div>
      <div className="flex w-full h-full justify-center items-center relative">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-[100%] aspect-square rounded-full object-cover border-5 ${
            faceMatch ? "border-green-600" : "border-red-600"
          }`}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full"
        />
      </div>
    </div>
  );
}

export default FaceScanner;
