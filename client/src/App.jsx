import { useEffect, useRef, useState } from 'react';
import './App.css';

const starterMessages = [
  { id: 1, role: 'assistant', text: 'Capture the scene first, then ask a question about what you can see.' },
  { id: 2, role: 'user', text: 'What is this room for?' },
  { id: 3, role: 'assistant', text: 'I’ll answer from the latest capture and your future room notes.' }
];

function App() {
  const [messages, setMessages] = useState(starterMessages);
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('Awaiting capture');
  const [preview, setPreview] = useState(null);
  const [streamActive, setStreamActive] = useState(false);
  const [captured, setCaptured] = useState(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(true);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const synthUtteranceRef = useRef(null);
  const latestQuestionRef = useRef('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  useEffect(() => {
    latestQuestionRef.current = question;
  }, [question]);

  useEffect(() => {
    return () => {
      stopStream();
      stopSpeaking();
      stopListening();
    };
  }, []);

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    synthUtteranceRef.current = null;
    setSpeaking(false);
  };

  const stopListening = () => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onend = null;
        rec.onerror = null;
        rec.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setListening(false);
  };

  const stopStream = () => {
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
  };

  const openScene = () => {
    window.open(
      'https://rodedwards.com/interactive-files/Warwick_Castle/index.html',
      '_blank',
      'noopener,noreferrer'
    );
  };

  const captureScene = async () => {
    try {
      setStatus('Choose a window or tab...');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false
      });

      streamRef.current = stream;
      setStreamActive(true);

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      const [track] = stream.getVideoTracks();
      track.addEventListener('ended', () => {
        stopStream();
        setStatus('Awaiting capture');
      });

      captureTimerRef.current = setTimeout(() => {
        takeSnapshot();
      }, 400);
    } catch (err) {
      setStatus(err.name === 'NotAllowedError' ? 'Screen capture cancelled' : 'Capture failed');
      stopStream();
    }
  };

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/png');
    setCaptured(dataUrl);
    setPreview(dataUrl);
    setStatus('Captured latest scene');
    stopStream();
  };

  const toggleAutoSubmit = () => {
    setAutoSubmit((v) => !v);
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: 'assistant', text: 'Speech recognition is not supported in this browser.' }
      ]);
      return;
    }

    stopListening();

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-GB';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      const clean = transcript.trim();
      latestQuestionRef.current = clean;
      setQuestion(clean);
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (autoSubmit && latestQuestionRef.current.trim()) {
        askQuestion({ preventDefault: () => {} }, latestQuestionRef.current.trim());
      }
    };

    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const speakText = (text) => {
    stopSpeaking();
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    synthUtteranceRef.current = utterance;
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const askQuestion = async (e, forcedQuestion = null) => {
    if (e?.preventDefault) e.preventDefault();
    const userText = (forcedQuestion ?? question).trim();
    if (!userText || !captured) return;

    setBusy(true);
    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', text: userText }]);
    setQuestion('');
    latestQuestionRef.current = '';

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userText, image: captured })
      });

      const data = await res.json();
      const answer = data.answer || 'No answer returned.';

      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', text: answer }]);
      speakText(answer);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'assistant', text: `Request failed: ${err.message}` }
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <video ref={videoRef} className="hidden-video" playsInline muted />

      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">Dissertation prototype</p>
          <h1>Voice Driven Interaction in AI VR Environment</h1>
          <p className="subhead">
            Open a 360 scene, capture the window, and ask questions about the room.
          </p>
        </div>

        <div className="topbar-actions">
          <a
            className="btn btn-secondary"
            href="https://rodedwards.com/interactive-files/Warwick_Castle/index.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open 360 Scene
          </a>

          <button
            className={`btn ${listening ? 'btn-warning' : 'btn-secondary'}`}
            onClick={listening ? stopListening : startListening}
            disabled={busy || speaking}
          >
            {listening ? 'Stop Listening' : 'Voice Input'}
          </button>

          <button
            className={`btn ${autoSubmit ? 'btn-primary' : 'btn-secondary'}`}
            onClick={toggleAutoSubmit}
            type="button"
          >
            {autoSubmit ? 'Auto-submit On' : 'Auto-submit Off'}
          </button>

          <button className="btn btn-primary" onClick={captureScene} disabled={busy}>
            Capture Window
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="panel scene-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Scene</p>
              <h2>Great Hall</h2>
            </div>
            <span className="pill">{status}</span>
          </div>

          <div className="scene-preview">
            {preview ? (
              <img src={preview} alt="Captured scene preview" />
            ) : (
              <p>No image captured yet.</p>
            )}
          </div>

          
        </section>

        <section className="panel chat-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Chat</p>
              <h2>Ask about the room</h2>
            </div>
            <div className="voice-status">
              {speaking ? 'Speaking answer' : listening ? 'Listening' : ''}
            </div>
          </div>

          <div className="messages">
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <p>{message.text}</p>
              </article>
            ))}
            {busy && (
              <article className="message assistant">
                <p>Thinking...</p>
              </article>
            )}
          </div>

          <form className="composer" onSubmit={askQuestion}>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={captured ? 'Type a question about the scene...' : 'Capture a scene first...'}
              disabled={!captured || busy}
            />
            <button className="btn btn-primary" type="submit" disabled={!captured || busy}>
              Ask
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;