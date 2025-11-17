import React, { useEffect, useRef, useState } from "react";
import AudioVisualizer from "../utils/audioVisualizer.jsx";
import { usePuter } from "../components/usePuter.js";
import VoiceInput from "../utils/voiceInput.jsx";

import Popup from "../utils/popups";
import TypewriterText from "../utils/TypeWriter.jsx";

export default function ChatModel() {
  //* ======================
  //* STATES
  //* ======================
  const EXPRESS_API = import.meta.env.VITE_EXPRESS_API;
  const [time, setTime] = useState(
    new Date().toLocaleString([], { hour: "2-digit", minute: "2-digit" })
  );
  const bottomRef = useRef(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [micON, setMicOn] = useState(false);
  const [holoOn, setHoloOn] = useState(false);
  const [visualizerStream, setVisualizerStream] = useState(null);
  const [speak, setSpeak] = useState("");
  const puterSpeak = usePuter();

  //* ======================
  //* TOGGLES
  //* ======================
  const toggleMic = () => setMicOn((prev) => !prev);
  const toggleHolo = () => setHoloOn((prev) => !prev);

  //* =========================
  //* HANDLES VOICE TRANSCRIPT
  //* =========================
  function voiceSubmit(voice) {
    console.log("voice:", voice);
    sendInput(voice);
  }

  //* ======================
  //* AUTO SCROLL FUNCTION
  //* ======================
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addMessage(msg) {
    setMessages((prev) => [...prev, msg]);
  }

  useEffect(() => {
    fetch(`${EXPRESS_API}/initialize/AI`).catch(console.error);
  }, []);

  //* =====================================
  //* SENDS MESSAGE AND HANDLE SENDER TYPE
  //* =====================================
  async function sendInput(msg) {
    const finalMsg = msg ?? input;
    if (!finalMsg.trim()) return;

    const userMsg = { sender: "user", text: finalMsg, timestamp: time };
    addMessage(userMsg);

    const msgToSend = finalMsg;
    setInput("");

    // Add temporary loading bubble
    const loadingMsg = { sender: "bot", text: "Thinking....", loading: true };
    addMessage(loadingMsg);

    try {
      const res = await fetch(`${EXPRESS_API}/v1/chat/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: msgToSend }),
      });

      if (!res.ok) throw new Error("SERVER OFFLINE");

      const data = await res.json();
      setSpeak(data.response.ai_response);

      // Remove loading bubble & add real response
      setMessages((prev) => [
        ...prev.filter((m) => !m.loading),
        {
          sender: "bot",
          text: data.response.ai_response || "No response.",
          timestamp: time,
        },
      ]);

      // 'image_map': {'by_id': {}, 'by_name': {}}
      // data.response.image_map
      // for images
    } catch (err) {
      console.warn("Backend offline — fallback mode");

      const fallback = getFallbackReply(msgToSend);
      setSpeak(fallback);

      setMessages((prev) => [
        ...prev.filter((m) => !m.loading),
        { sender: "bot", text: fallback, timestamp: time },
      ]);
    }
  }

  //* ======================
  //* FALLBACK RESPONSE
  //* ======================
  function getFallbackReply(input) {
    const lower = input.toLowerCase();

    if (lower.includes("hello") || lower.includes("hi"))
      return "Hello! I'm your AI assistant. The server is currently offline. How can I help you today? ";

    if (lower.includes("schedule"))
      return "A schedule table will be generated once the server is running.";

    if (lower.includes("file"))
      return "Unaivable to gather file data. The server is currently offline.";

    if (lower.includes("who are you"))
      return "I'm a demo AI assistant. In a full implementation, I would connect to an AI service to provide intelligent responses. For now, I'm here to show you the beautiful interface!";

    return "Server is undergoing maintenance (╥﹏╥)";
  }

  //* ========================
  //* Text-to-Speech Handling
  //* ========================
  useEffect(() => {
    const speakResponse = async () => {
      if (!speak) return;

      const result = await puterSpeak(speak, { voice: "Lupe" });
      if (result) setVisualizerStream(result);

      setSpeak("");
    };

    // Speak if hologram is ON or mic is ON
    if (holoOn || micON) {
      speakResponse();
    }
  }, [speak]);

  //* ======================
  //* POPUP HANDLER
  //* ======================
  const [popup, setPopup] = useState({
    show: false,
    type: "success",
    message: "",
  });

  const showPopup = (type, message) => {
    setPopup({ show: true, type, message });
    setTimeout(() => {
      setPopup({ show: false, type: "", message: "" });
    }, 4000);
  };

  return (
    <div className="w-full h-[92vh] flex flex-col items-center">
      <div className="w-[50%] h-full overflow-auto no-scrollbar p-3 space-y-8">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`p-3 rounded-md shadow-black/40 flex flex-col leading-tight gap-2 typo-content-regular max-w-[70%] ${
              m.sender === "user"
                ? "bg-[#792C1A] w-fit h-fit whitespace-normal break-words shadow-sm text-white ml-auto"
                : "bg-gray-50 w-fit h-fit whitespace-normal break-words shadow-xl  text-black"
            }`}
          >
            {m.sender === "bot" ? (
              <TypewriterText text={m.text} speed={18} />
            ) : (
              m.text
            )}
            <span className="text-[clamp(0.3rem,0.6vw,1rem)]">
              {m.timestamp}
            </span>
          </div>
        ))}
        <div ref={bottomRef} className="mt-10"></div>
      </div>

      {/* INPUT CONTAINER  */}
      <div className="w-full flex justify-center p-2 border-t border-black/20">
        <div className="flex gap-1 py-2">
          {/* HOLO BUTTON */}
          <button
            onClick={async () => {
              if (
                "webkitSpeechRecognition" in window ||
                "SpeechRecognition" in window
              ) {
                toggleHolo();
                toggleMic();
              } else {
                showPopup("error", "Your browser do not support this feature");
                return;
              }
            }}
            className="bg-amber-500 shadow-black/50 shadow-sm text-white px-2 rounded-full cursor-pointer hover:bg-amber-400 hover:shadow-black/70"
          >
            <img src="./navIco/bot.svg" alt="" />
          </button>
          {/* MIC BUTTON */}
          <button
            onClick={async () => {
              if (
                "webkitSpeechRecognition" in window ||
                "SpeechRecognition" in window
              ) {
                toggleMic();
              } else {
                showPopup("error", "Your browser do not support this feature");
                return;
              }
            }}
            className={`shadow-black/50 shadow-sm text-white px-2 rounded-full cursor-pointer hover:bg-amber-400 hover:shadow-black/70 ${
              micON ? "bg-green-700" : "bg-amber-500"
            }`}
          >
            <img src="./navIco/mic.svg" alt="" />
          </button>
        </div>
        {!micON ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendInput();
            }}
            className="flex w-[80%] gap-1 p-2"
          >
            <input
              className="flex-1 border border-black/20 rounded p-2"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type message..."
            />
            {/* SUBMIT BUTTON */}
            <button className="bg-amber-500 shadow-black/50 shadow-sm text-white px-4 rounded cursor-pointer hover:bg-amber-400 hover:shadow-black/70">
              <img src="./navIco/send-horizontal.svg" alt="" />
            </button>
          </form>
        ) : (
          <VoiceInput
            voiceSubmit={voiceSubmit}
            micON={micON}
            toggleMic={toggleMic}
            mode={holoOn}
          />
        )}
      </div>
      {holoOn && (
        <div className="fixed inset-0 flex flex-col items-center justify-center p-5 bg-[linear-gradient(to_top,rgba(255,255,255,0.9),rgba(255,255,255,0.7)),url('/images/PDM-Facade.png')] bg-no-repeat bg-center bg-cover z-50">
          <AudioVisualizer
            toggleHolo={toggleHolo}
            toggleMic={toggleMic}
            audioStream={visualizerStream}
          />
          <VoiceInput
            voiceSubmit={voiceSubmit}
            micON={micON}
            toggleMic={toggleMic}
            mode={holoOn}
          />
        </div>
      )}
      <Popup
        show={popup.show}
        type={popup.type}
        message={popup.message}
        onClose={() => setPopup({ show: false, type: "", message: "" })}
      />
    </div>
  );
}
