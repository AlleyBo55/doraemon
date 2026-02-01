/**
 * Doraemon Desktop - Main Renderer Entry
 * A beautiful Shimeji-style desktop mascot connected to OpenClaw
 * With rich emotions, dynamic animations, and seamless interactions
 */

import { EmotionEngine, emotionEmoji, emotionMessages, type Emotion, type SpecialAnimation } from './emotion-engine';
import { OpenClawClient, type OpenClawFrame } from './openclaw-client';
import { ShimejiEngine, getAnimationForState, type ShimejiState } from './shimeji-engine';
import { loadShimejiSprites, generatePlaceholderSprites, type SpriteSet, type LoadedAnimation } from './sprite-loader';

declare global {
  interface Window {
    doraemon?: {
      getConfig: () => Promise<{ openclawUrl: string; spritePath: string }>;
      getScreenSize: () => Promise<{ width: number; height: number }>;
      setPosition: (x: number, y: number) => void;
      setMouseEvents: (enabled: boolean) => void;
      onScreenChange: (callback: (size: { width: number; height: number }) => void) => void;
    };
  }
}

class DoraemonApp {
  private emotionEngine: EmotionEngine;
  private openclawClient: OpenClawClient;
  private shimejiEngine!: ShimejiEngine;
  private sprites!: SpriteSet;
  
  private currentEmotion: Emotion = 'neutral';
  private currentState: ShimejiState = 'idle';
  private currentFrame = 0;
  private isFlipped = false;
  private isThinking = false;
  private isChatVisible = false;
  
  // Animation state
  private animationTime = 0;
  private currentAnimation: LoadedAnimation | null = null;
  private specialAnimation: LoadedAnimation | null = null;
  private specialAnimationFrame = 0;
  private isPlayingSpecial = false;

  // DOM elements
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private chatContainer!: HTMLElement;
  private speechBubble!: HTMLElement;
  private speechText!: HTMLElement;
  private thinkingIndicator!: HTMLElement;
  private inputContainer!: HTMLElement;
  private chatInput!: HTMLInputElement;
  private sendBtn!: HTMLElement;
  private emotionBadge!: HTMLElement;
  private connectionDot!: HTMLElement;
  private statusText!: HTMLElement;

  private lastTime = 0;
  private isConnectedToOpenClaw = false;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDragging = false;

  constructor() {
    this.emotionEngine = new EmotionEngine();
    this.openclawClient = new OpenClawClient();
    this.init();
  }

  private async init() {
    this.initDOMElements();
    await this.initScreen();
    await this.loadSprites();
    this.setupEmotionEngine();
    this.setupOpenClawConnection();
    this.setupInteractions();
    this.startAnimationLoop();
    
    // Welcome greeting
    setTimeout(() => {
      this.playSpecialAnimation('greeting');
      this.showGreeting();
    }, 500);
  }

  private initDOMElements() {
    this.canvas = document.getElementById('avatar-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.chatContainer = document.getElementById('chat-container') as HTMLElement;
    this.speechBubble = document.getElementById('speech-bubble') as HTMLElement;
    this.speechText = document.getElementById('speech-text') as HTMLElement;
    this.thinkingIndicator = document.getElementById('thinking-indicator') as HTMLElement;
    this.inputContainer = document.getElementById('input-container') as HTMLElement;
    this.chatInput = document.getElementById('chat-input') as HTMLInputElement;
    this.sendBtn = document.getElementById('send-btn') as HTMLElement;
    this.emotionBadge = document.getElementById('emotion-badge') as HTMLElement;
    this.connectionDot = document.getElementById('connection-dot') as HTMLElement;
    this.statusText = document.getElementById('status-text') as HTMLElement;
  }

  private async initScreen() {
    let screenWidth = window.innerWidth;
    let screenHeight = window.innerHeight;
    
    try {
      const size = await window.doraemon?.getScreenSize();
      if (size) {
        screenWidth = size.width;
        screenHeight = size.height;
      }
    } catch {
      console.log('[Doraemon] Running in browser mode');
    }

    this.shimejiEngine = new ShimejiEngine(screenWidth, screenHeight);
    this.shimejiEngine.setSpriteSize(128, 128);
    
    this.shimejiEngine.setCallbacks(
      (pos) => this.updateWindowPosition(pos.x, pos.y),
      (state, frame, flip) => {
        this.currentState = state;
        this.currentFrame = frame;
        this.isFlipped = flip;
      }
    );

    window.doraemon?.onScreenChange?.((size) => {
      this.shimejiEngine.updateScreenSize(size.width, size.height);
    });
  }

  private async loadSprites() {
    try {
      const spritePath = '/dora-sprites';
      console.log(`[Doraemon] Loading sprites from: ${spritePath}`);
      this.sprites = await loadShimejiSprites(spritePath);
      
      if (this.sprites.actions.size === 0) {
        console.log('[Doraemon] No sprites loaded, using placeholders');
        this.sprites = generatePlaceholderSprites();
      } else {
        console.log(`[Doraemon] Loaded ${this.sprites.allImages.size} sprites!`);
        console.log(`[Doraemon] Actions: ${this.sprites.actions.size}, Emotions: ${this.sprites.emotions.size}, Special: ${this.sprites.special.size}`);
      }
    } catch (e) {
      console.log('[Doraemon] Failed to load sprites, using placeholders:', e);
      this.sprites = generatePlaceholderSprites();
    }
  }

  private setupEmotionEngine() {
    this.emotionEngine.setOnEmotionChange((state) => {
      this.currentEmotion = state.current;
      this.updateEmotionBadge(state.current);
      
      // Update current animation based on emotion
      this.currentAnimation = this.sprites.emotions.get(state.current) || null;
      this.animationTime = 0;
      
      // Trigger physical behavior based on emotion
      if (['excited', 'happy', 'celebrating', 'success'].includes(state.current)) {
        this.shimejiEngine.triggerBehavior('jump');
      } else if (['sleepy', 'sleeping', 'sad', 'crying'].includes(state.current)) {
        this.shimejiEngine.triggerBehavior('sit');
      }
    });

    this.emotionEngine.setOnSpecialAnimation((animation) => {
      this.playSpecialAnimation(animation);
    });
  }

  private playSpecialAnimation(name: SpecialAnimation) {
    const anim = this.sprites.special.get(name);
    if (anim) {
      console.log(`[Doraemon] Playing special animation: ${name}`);
      this.specialAnimation = anim;
      this.specialAnimationFrame = 0;
      this.isPlayingSpecial = true;
    }
  }

  private async setupOpenClawConnection() {
    this.openclawClient.setOnEvent((event) => {
      console.log('[Doraemon] OpenClaw event:', event.event);
      this.handleOpenClawEvent(event);
    });

    this.openclawClient.setOnStateChange((state) => {
      console.log('[Doraemon] Connection state:', state);
      const wasConnected = this.isConnectedToOpenClaw;
      this.isConnectedToOpenClaw = state === 'connected';
      this.updateConnectionStatus(this.isConnectedToOpenClaw);
      
      if (state === 'connected') {
        this.emotionEngine.onConnectionChange(true);
      } else if (state === 'disconnected') {
        // Check if we lost connection while waiting for a response
        if (wasConnected && this.emotionEngine.isWaiting()) {
          this.handleConnectionLostWhileWaiting();
        }
        this.emotionEngine.onConnectionChange(false);
      }
      // 'connecting' and 'reconnecting' don't trigger emotion changes
    });

    this.openclawClient.setOnReconnectAttempt((attempt, delay) => {
      this.updateReconnectStatus(attempt, delay);
    });

    try {
      const config = await window.doraemon?.getConfig();
      const openclawUrl = config?.openclawUrl || 'ws://127.0.0.1:18789';
      
      console.log(`[Doraemon] Connecting to OpenClaw at: ${openclawUrl}`);
      this.openclawClient = new OpenClawClient(openclawUrl);
      
      this.openclawClient.setOnEvent((event) => this.handleOpenClawEvent(event));
      this.openclawClient.setOnStateChange((state) => {
        console.log('[Doraemon] Connection state:', state);
        const wasConnected = this.isConnectedToOpenClaw;
        this.isConnectedToOpenClaw = state === 'connected';
        this.updateConnectionStatus(this.isConnectedToOpenClaw);
        
        if (state === 'connected') {
          this.emotionEngine.onConnectionChange(true);
        } else if (state === 'disconnected') {
          // Check if we lost connection while waiting for a response
          if (wasConnected && this.emotionEngine.isWaiting()) {
            this.handleConnectionLostWhileWaiting();
          }
          this.emotionEngine.onConnectionChange(false);
        }
      });
      this.openclawClient.setOnReconnectAttempt((attempt, delay) => {
        this.updateReconnectStatus(attempt, delay);
      });
      
      this.openclawClient.connect();
    } catch (e) {
      console.log('[Doraemon] Using default OpenClaw URL');
      this.openclawClient.connect();
    }
  }

  private handleOpenClawEvent(event: OpenClawFrame) {
    this.emotionEngine.processEvent(event);
    
    // Handle chat events
    if (event.event === 'chat') {
      const payload = event.payload as { 
        state?: string; 
        message?: { role?: string; content?: Array<{ type?: string; text?: string }> } | string;
        content?: string;
      };
      
      if (payload?.state === 'delta') {
        // Show thinking indicator and stream the text if available
        this.showThinking();
        
        // Extract text from message if available (streaming delta)
        const message = payload.message;
        if (message && typeof message === 'object' && message.content) {
          const textContent = message.content.find(c => c.type === 'text');
          if (textContent?.text) {
            this.updateThinkingText(textContent.text);
          }
        }
      } else if (payload?.state === 'final') {
        // Response received - stop waiting
        this.emotionEngine.stopWaitingForResponse();
        
        // Extract final message
        const message = payload.message;
        let finalText = '';
        if (message && typeof message === 'object' && message.content) {
          const textContent = message.content.find(c => c.type === 'text');
          finalText = textContent?.text || '';
        } else if (typeof message === 'string') {
          finalText = message;
        } else if (payload.content) {
          finalText = payload.content;
        }
        
        if (finalText) {
          this.showMessage(finalText);
        }
        this.hideThinking();
      } else if (payload?.state === 'error' || payload?.state === 'aborted') {
        // Error or abort - stop waiting
        this.emotionEngine.stopWaitingForResponse();
        this.hideThinking();
        if (payload?.state === 'error') {
          this.showMessage("Oops! Something went wrong... 😢");
        }
      }
    }
    
    // Handle agent events - show reasoning/thinking stream
    if (event.event === 'agent') {
      const payload = event.payload as {
        stream?: string;
        data?: { text?: string; phase?: string; tool?: string };
      };
      
      // Show assistant stream (chain of thought / reasoning)
      if (payload?.stream === 'assistant' && payload.data?.text) {
        this.updateThinkingText(payload.data.text);
      }
      
      // Show tool usage
      if (payload?.stream === 'tool' && payload.data?.tool) {
        this.updateThinkingText(`🔧 Using: ${payload.data.tool}...`);
      }
    }
  }

  private setupInteractions() {
    // Click on mascot to toggle chat
    this.canvas.addEventListener('click', (e) => {
      if (!this.isDragging) {
        this.toggleChat();
      }
      e.stopPropagation();
    });

    // Double-click for special animation
    this.canvas.addEventListener('dblclick', () => {
      this.playSpecialAnimation('pocket_pull');
      this.emotionEngine.triggerEmotion('mischievous', 0.8);
    });

    // Send message
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.sendBtn.addEventListener('click', () => this.sendMessage());

    // Keep chat open when interacting
    this.chatContainer.addEventListener('mouseenter', () => {
      this.cancelHideTimeout();
    });

    this.chatContainer.addEventListener('mouseleave', () => {
      if (!this.chatInput.value && !this.isThinking) {
        this.scheduleHideChat();
      }
    });

    this.setupDragging();
  }

  private setupDragging() {
    let dragStartTime = 0;
    
    this.canvas.addEventListener('mousedown', (e) => {
      dragStartTime = Date.now();
      this.isDragging = true;
      this.shimejiEngine.startDrag();
      window.doraemon?.setMouseEvents(true);
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.shimejiEngine.drag(e.screenX, e.screenY);
      }
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        const dragDuration = Date.now() - dragStartTime;
        this.isDragging = false;
        this.shimejiEngine.endDrag();
        
        // If it was a quick click (not a drag), don't count as drag
        if (dragDuration < 200) {
          this.isDragging = false;
        }
      }
    });

    this.canvas.addEventListener('mouseenter', () => {
      window.doraemon?.setMouseEvents(true);
    });

    this.canvas.addEventListener('mouseleave', () => {
      if (!this.isDragging) {
        window.doraemon?.setMouseEvents(false);
      }
    });
  }

  private toggleChat() {
    if (this.isChatVisible) {
      this.hideChat();
    } else {
      this.showChat();
    }
  }

  private showChat() {
    this.isChatVisible = true;
    this.chatContainer.classList.add('visible');
    this.inputContainer.classList.add('visible');
    this.cancelHideTimeout();
    setTimeout(() => this.chatInput.focus(), 300);
  }

  private hideChat() {
    this.isChatVisible = false;
    this.chatContainer.classList.remove('visible');
    this.speechBubble.classList.remove('visible');
    this.inputContainer.classList.remove('visible');
  }

  private scheduleHideChat() {
    this.cancelHideTimeout();
    this.hideTimeout = setTimeout(() => {
      if (!this.isThinking && !this.chatInput.value) {
        this.hideChat();
      }
    }, 5000);
  }

  private cancelHideTimeout() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  private showGreeting() {
    const greetings = [
      "Hi! I'm Doraemon! 🎉",
      "Need a gadget from my pocket?",
      "Click me to chat!",
      "Doraemon desu! ✨",
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    this.showMessage(greeting);
    this.emotionEngine.triggerEmotion('excited', 0.8);
  }

  private showMessage(text: string) {
    this.showChat();
    this.hideThinking();
    this.speechText.textContent = text;
    this.speechBubble.classList.add('visible');
    this.scheduleHideChat();
  }

  private showThinking() {
    this.isThinking = true;
    this.showChat();
    this.speechText.textContent = '';
    this.thinkingIndicator.classList.add('visible');
    this.speechBubble.classList.add('visible');
    this.cancelHideTimeout();
  }

  /**
   * Update the thinking text with streaming content (chain of thought / reasoning)
   */
  private updateThinkingText(text: string) {
    if (!this.isThinking) {
      this.showThinking();
    }
    
    // Show the streaming text alongside the thinking indicator
    // Truncate if too long for the bubble
    const maxLength = 200;
    const displayText = text.length > maxLength 
      ? '...' + text.slice(-maxLength) 
      : text;
    
    this.speechText.textContent = displayText;
    this.speechText.classList.add('thinking-stream');
    
    // Auto-scroll to bottom if content overflows
    this.speechBubble.scrollTop = this.speechBubble.scrollHeight;
  }

  private hideThinking() {
    this.isThinking = false;
    this.thinkingIndicator.classList.remove('visible');
    this.speechText.classList.remove('thinking-stream');
  }

  private sendMessage() {
    const message = this.chatInput.value.trim();
    if (!message) return;

    this.chatInput.value = '';
    
    // Check if we're already waiting for a response
    if (this.emotionEngine.isWaiting()) {
      this.showMessage("Hold on, I'm still thinking about the last one! 🤔");
      return;
    }
    
    this.showMessage(`You: "${message}"`);
    
    if (this.isConnectedToOpenClaw) {
      // Start waiting for response with 60 second timeout
      this.emotionEngine.startWaitingForResponse(60000);
      this.emotionEngine.onUserMessage();
      
      try {
        this.openclawClient.sendChat(message);
        this.showThinking();
      } catch (e) {
        // Failed to send - handle gracefully
        console.error('[Doraemon] Failed to send message:', e);
        this.emotionEngine.stopWaitingForResponse();
        this.hideThinking();
        this.handleSendFailure();
      }
    } else {
      // Offline mode - Doraemon responds with personality!
      this.emotionEngine.triggerEmotion('thinking', 0.6);
      
      setTimeout(() => {
        const offlineResponses = [
          "I can't reach OpenClaw right now... but I'm still here! 🐱",
          "My connection to the future is down... try again later? 📡",
          "Hmm, my 4D pocket can't connect... OpenClaw might be sleeping! 💤",
          "I'm in offline mode! Start OpenClaw and I'll be smarter~ ✨",
          "Without OpenClaw, I'm just a cute cat robot! 🤖",
          "*checks pocket* ...no signal from the future! 📱",
          "OpenClaw is my brain... and it's taking a nap! 😴",
        ];
        
        // Sometimes use emotion-based responses, sometimes offline-specific
        const useOfflineResponse = Math.random() < 0.6;
        let response: string;
        
        if (useOfflineResponse) {
          response = offlineResponses[Math.floor(Math.random() * offlineResponses.length)];
        } else {
          const responses = emotionMessages[this.currentEmotion] || emotionMessages.neutral;
          response = responses[Math.floor(Math.random() * responses.length)];
        }
        
        this.showMessage(response);
        this.emotionEngine.triggerEmotion('sad', 0.4);
      }, 800);
    }
  }

  /**
   * Handle when sending a message fails
   */
  private handleSendFailure() {
    const failureMessages = [
      "Oops! My message got lost in the 4D pocket... 😅",
      "The connection hiccuped! Try again? 🔄",
      "Something went wrong sending that... 😢",
      "*fumbles* ...dropped the message! 📝",
    ];
    
    const message = failureMessages[Math.floor(Math.random() * failureMessages.length)];
    this.showMessage(message);
    this.emotionEngine.triggerEmotion('confused', 0.6);
  }

  /**
   * Handle when connection is lost while waiting for response
   * Called from emotion engine callback
   */
  private handleConnectionLostWhileWaiting() {
    this.hideThinking();
    
    const lostMessages = [
      "Oh no! I lost connection while thinking... 😱",
      "The link to OpenClaw broke! My thought got interrupted... 💔",
      "Connection lost mid-thought! I'll try to reconnect... 🔄",
      "*static noise* ...lost the signal! 📡",
    ];
    
    const message = lostMessages[Math.floor(Math.random() * lostMessages.length)];
    this.showMessage(message);
  }

  private updateEmotionBadge(emotion: Emotion) {
    this.emotionBadge.textContent = emotionEmoji[emotion] || emotionEmoji.neutral;
    this.emotionBadge.classList.remove('bounce');
    void this.emotionBadge.offsetWidth;
    this.emotionBadge.classList.add('bounce');
  }

  private updateConnectionStatus(connected: boolean) {
    if (connected) {
      this.connectionDot.classList.add('connected');
      this.connectionDot.classList.remove('reconnecting');
      this.statusText.textContent = 'Connected';
    } else {
      this.connectionDot.classList.remove('connected');
      this.statusText.textContent = 'Offline';
    }
  }

  private updateReconnectStatus(attempt: number, delay: number) {
    this.connectionDot.classList.add('reconnecting');
    this.statusText.textContent = `Reconnecting... (${attempt})`;
    
    // Trigger reconnecting animation (sad laying loop)
    this.emotionEngine.onReconnecting();
    
    // Show a message if many attempts
    if (attempt === 3) {
      this.showMessage("Can't reach OpenClaw... I'll keep trying! 🔄");
    } else if (attempt === 10) {
      this.showMessage("OpenClaw seems to be offline. I'll wait here! 😴");
    }
  }

  private updateWindowPosition(x: number, y: number) {
    try {
      window.doraemon?.setPosition(Math.round(x), Math.round(y));
    } catch {
      // Browser mode
    }
  }

  private startAnimationLoop() {
    const loop = (time: number) => {
      const deltaTime = time - this.lastTime;
      this.lastTime = time;

      this.shimejiEngine.update(deltaTime);
      this.updateAnimation(deltaTime);
      this.render();

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  private updateAnimation(deltaTime: number) {
    this.animationTime += deltaTime;
    
    // Handle special animation
    if (this.isPlayingSpecial && this.specialAnimation) {
      const frameIndex = Math.floor(this.animationTime / this.specialAnimation.frameDelay);
      
      if (frameIndex >= this.specialAnimation.frames.length) {
        if (this.specialAnimation.loop) {
          this.animationTime = 0;
          this.specialAnimationFrame = 0;
        } else {
          // Special animation finished
          this.isPlayingSpecial = false;
          this.specialAnimation = null;
          this.animationTime = 0;
        }
      } else {
        this.specialAnimationFrame = frameIndex;
      }
    }
  }

  private render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    let frame: HTMLImageElement | null = null;

    // Priority: Special animation > Emotion animation > Action animation
    if (this.isPlayingSpecial && this.specialAnimation) {
      const idx = this.specialAnimationFrame % this.specialAnimation.frames.length;
      frame = this.specialAnimation.frames[idx];
    } else if (this.currentAnimation) {
      const idx = Math.floor(this.animationTime / this.currentAnimation.frameDelay) % this.currentAnimation.frames.length;
      frame = this.currentAnimation.frames[idx];
    } else {
      // Fallback to action animation
      const actionName = getAnimationForState(this.currentState);
      const animation = this.sprites.actions.get(actionName) || this.sprites.actions.get('idle');
      
      if (animation) {
        const idx = this.currentFrame % animation.frames.length;
        frame = animation.frames[idx];
      }
    }

    if (!frame) return;

    this.ctx.save();
    if (this.isFlipped) {
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(frame, -this.canvas.width, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.restore();
  }
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new DoraemonApp());
} else {
  new DoraemonApp();
}
