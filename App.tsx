import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiLiveService } from './services/geminiService';
import { Visualizer } from './components/Visualizer';
import { ConnectionState, ChatMessage } from './types';
import { Phone, PhoneOff, Mic, Settings, MessageSquareText } from 'lucide-react';

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [micVolume, setMicVolume] = useState(0);
  const serviceRef = useRef<GeminiLiveService | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleStartCall = async () => {
    if (!process.env.API_KEY) {
      alert("API Key is missing in environment variables.");
      return;
    }

    setConnectionState(ConnectionState.CONNECTING);
    setMessages([]);
    
    const service = new GeminiLiveService();
    serviceRef.current = service;

    try {
      await service.connect(
        () => setConnectionState(ConnectionState.CONNECTED),
        () => setConnectionState(ConnectionState.DISCONNECTED),
        () => setConnectionState(ConnectionState.ERROR),
        (text, isUser, isFinal) => {
          setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsgIndex = newMsgs.length - 1;
            const lastMsg = newMsgs[lastMsgIndex];
            
            // Check if we have a pending message to update
            if (lastMsg && lastMsg.role === (isUser ? 'user' : 'model') && !lastMsg.isFinal) {
              // Update existing pending message immutably
              newMsgs[lastMsgIndex] = {
                ...lastMsg,
                text: lastMsg.text + text,
                isFinal: isFinal
              };
              return newMsgs;
            } else {
              // Don't create empty messages
              if (!text.trim()) return prev;

              // Add new message
              return [...newMsgs, {
                id: Date.now().toString() + Math.random(),
                role: isUser ? 'user' : 'model',
                text: text,
                timestamp: new Date(),
                isFinal: isFinal
              }];
            }
          });
        },
        (vol) => setMicVolume(vol)
      );
    } catch (e) {
      console.error(e);
      setConnectionState(ConnectionState.ERROR);
    }
  };

  const handleEndCall = useCallback(async () => {
    if (serviceRef.current) {
      await serviceRef.current.disconnect();
      serviceRef.current = null;
    }
    setConnectionState(ConnectionState.DISCONNECTED);
    setMicVolume(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.disconnect();
      }
    };
  }, []);

  const isLive = connectionState === ConnectionState.CONNECTED;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8 font-sans">
      {/* Header */}
      <header className="w-full max-w-2xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
                <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-900">智能家电客服</h1>
                <p className="text-sm text-slate-500">24小时在线 • 语音交互</p>
            </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 ${
          connectionState === ConnectionState.CONNECTED ? 'bg-green-100 text-green-700' :
          connectionState === ConnectionState.CONNECTING ? 'bg-yellow-100 text-yellow-700' :
          connectionState === ConnectionState.ERROR ? 'bg-red-100 text-red-700' :
          'bg-slate-200 text-slate-600'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
             connectionState === ConnectionState.CONNECTED ? 'bg-green-500 animate-pulse' :
             connectionState === ConnectionState.CONNECTING ? 'bg-yellow-500' :
             connectionState === ConnectionState.ERROR ? 'bg-red-500' :
             'bg-slate-400'
          }`}></span>
          {connectionState === ConnectionState.CONNECTED ? '通话中' :
           connectionState === ConnectionState.CONNECTING ? '连接中...' :
           connectionState === ConnectionState.ERROR ? '连接错误' :
           '未连接'}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col min-h-[500px] border border-slate-100">
        
        {/* Visualizer Area */}
        <div className="relative h-64 bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center flex-shrink-0">
            {/* Overlay Text when Idle */}
            {!isLive && connectionState !== ConnectionState.CONNECTING && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 z-10">
                    <p>点击下方按钮开始通话</p>
                </div>
            )}
            
            <Visualizer isActive={isLive} volume={micVolume} />
            
            {/* Agent Info Overlay */}
            <div className="absolute bottom-4 left-4 right-4 flex justify-between text-white/80 text-sm">
                <span>客服专员: 小智</span>
                <span>{isLive ? "正在聆听..." : "等待接入"}</span>
            </div>
        </div>

        {/* Transcript / Chat Area */}
        <div className="flex-1 bg-slate-50 p-4 overflow-y-auto scrollbar-hide max-h-[400px]" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <MessageSquareText className="w-8 h-8 opacity-50" />
                <p className="text-sm">通话记录将显示在这里</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none shadow-md' 
                      : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-sm'
                  }`}>
                    {msg.text}
                    {!msg.isFinal && <span className="animate-pulse ml-1">...</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Control Bar */}
        <div className="p-6 bg-white border-t border-slate-100 flex justify-center items-center gap-6">
            {connectionState === ConnectionState.DISCONNECTED || connectionState === ConnectionState.ERROR ? (
                <button 
                    onClick={handleStartCall}
                    className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-8 py-4 rounded-full font-semibold shadow-lg shadow-blue-200 transition-all transform hover:scale-105"
                >
                    <Phone className="w-5 h-5" />
                    <span>拨打客服电话</span>
                </button>
            ) : (
                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center gap-1 text-slate-400">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                            <Mic className={`w-5 h-5 ${isLive ? 'text-blue-500 animate-pulse' : 'text-slate-400'}`} />
                        </div>
                        <span className="text-xs font-medium">麦克风</span>
                    </div>

                    <button 
                        onClick={handleEndCall}
                        className="flex items-center justify-center bg-red-500 hover:bg-red-600 text-white w-16 h-16 rounded-full shadow-lg shadow-red-200 transition-all transform hover:scale-105"
                    >
                        <PhoneOff className="w-8 h-8" />
                    </button>
                </div>
            )}
        </div>
      </main>

      <footer className="mt-8 text-slate-400 text-xs text-center max-w-md leading-relaxed">
        <p>本服务由 Gemini Live API 提供技术支持。</p>
        <p>请确保您的设备已开启麦克风权限。</p>
      </footer>
    </div>
  );
};

export default App;