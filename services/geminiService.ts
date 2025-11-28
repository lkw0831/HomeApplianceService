import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';

// Constants
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';
const SYSTEM_INSTRUCTION = `
你是一位专业的家电客服坐席，名叫“小智”。
你的职责是接听用户电话，根据用户的语音内容，迅速判断其意图，并给出专业的语音回复。

主要意图分类：
1. **投诉**：用户对产品或服务不满。
2. **报修**：用户家电坏了，需要维修。
3. **查询状态**：用户询问维修进度、发货状态或保修期。

回复原则：
- **必须使用中文语音回复**。
- **语气**：专业、冷静、亲切、有同理心。
- **简短**：每次回复不要太长，类似真实的电话交流。
- **流程**：
  - 如果是**投诉**：首先安抚用户情绪（“非常抱歉给您带来不便”），然后询问具体问题。
  - 如果是**报修**：询问电器类型（冰箱、洗衣机等）和具体故障现象。
  - 如果是**查询状态**：询问相关的订单号、手机号或服务单号。
  - 如果意图不明，礼貌地请用户重述或引导用户（“请问您是需要报修还是查询进度？”）。

请始终保持客服的专业形象。
`;

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: any = null; // Typing as any because session types are internal to the SDK mostly
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextStartTime = 0;
  private outputNode: GainNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async connect(
    onOpen: () => void,
    onClose: () => void,
    onError: (e: ErrorEvent) => void,
    onMessage: (text: string, isUser: boolean, isFinal: boolean) => void,
    onVolumeChange: (vol: number) => void
  ) {
    // 1. Setup Audio Contexts
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.outputNode = this.outputAudioContext.createGain();
    this.outputNode.connect(this.outputAudioContext.destination);

    // 2. Get Microphone Stream with Echo Cancellation
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
    } catch (err) {
      console.error("Microphone access denied", err);
      throw err;
    }

    // 3. Connect to Gemini Live
    const sessionPromise = this.ai.live.connect({
      model: MODEL_NAME,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        systemInstruction: SYSTEM_INSTRUCTION,
        inputAudioTranscription: {}, // Enabled without 'model' property
        outputAudioTranscription: {}, // Enabled without 'model' property
      },
      callbacks: {
        onopen: () => {
          console.log("Gemini Live Session Opened");
          this.startInputStreaming(sessionPromise, onVolumeChange);
          onOpen();
        },
        onmessage: async (message: LiveServerMessage) => {
          this.handleServerMessage(message, onMessage);
        },
        onclose: (e: CloseEvent) => {
          console.log("Gemini Live Session Closed", e);
          onClose();
        },
        onerror: (e: ErrorEvent) => {
          console.error("Gemini Live Session Error", e);
          onError(e);
        },
      },
    });

    this.session = sessionPromise;
  }

  private startInputStreaming(sessionPromise: Promise<any>, onVolumeChange: (vol: number) => void) {
    if (!this.inputAudioContext || !this.stream) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      onVolumeChange(rms);

      const pcmBlob = createBlob(inputData);
      sessionPromise.then((session) => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleServerMessage(
    message: LiveServerMessage,
    onMessage: (text: string, isUser: boolean, isFinal: boolean) => void
  ) {
    // Handle Text Transcription (User or Model)
    if (message.serverContent?.inputTranscription) {
      onMessage(message.serverContent.inputTranscription.text ?? '', true, !!message.serverContent.turnComplete);
    }
    if (message.serverContent?.outputTranscription) {
      onMessage(message.serverContent.outputTranscription.text ?? '', false, !!message.serverContent.turnComplete);
    }

    // Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputNode) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
      
      try {
        const audioBuffer = await decodeAudioData(
            decode(base64Audio),
            this.outputAudioContext,
            24000
        );

        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        
        source.addEventListener('ended', () => {
            this.sources.delete(source);
        });

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);

      } catch (err) {
        console.error("Error decoding audio response", err);
      }
    }

    // Handle Interruption
    if (message.serverContent?.interrupted) {
        console.log("Model interrupted");
        this.sources.forEach(src => src.stop());
        this.sources.clear();
        this.nextStartTime = 0;
    }
  }

  async disconnect() {
    // 1. Close Session
    if (this.session) {
        this.session.then((s: any) => {
             if (s.close) s.close(); 
        });
    }

    // 2. Stop Processor & Source
    if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
    }
    if (this.source) {
        this.source.disconnect();
        this.source = null;
    }

    // 3. Stop Stream Tracks
    if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
    }

    // 4. Close Audio Contexts
    if (this.inputAudioContext) {
        await this.inputAudioContext.close();
        this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
        await this.outputAudioContext.close();
        this.outputAudioContext = null;
    }
    
    // 5. Cleanup Queued Audio
    this.sources.forEach(src => src.stop());
    this.sources.clear();
    this.nextStartTime = 0;
  }
}