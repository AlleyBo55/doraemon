/**
 * Emotion Engine - Maps OpenClaw events to rich avatar emotions
 * Supports 25+ emotions with smooth transitions
 * 
 * OpenClaw Gateway Events Handled:
 * - tick: Heartbeat (~15s intervals)
 * - chat: Chat events (delta/final/error/aborted)
 * - agent: Agent events (lifecycle/tool/assistant/error streams)
 * - presence: Connection presence updates
 * - health: System health updates
 * - shutdown: Server shutdown notification
 * - cron: Scheduled task events
 * - heartbeat: Heartbeat run events
 * - voicewake.changed: Voice wake trigger changes
 * - talk.mode: Talk mode changes
 * - exec.approval.requested/resolved: Execution approval events
 */

import type { OpenClawFrame } from './openclaw-client';

// All available emotions (matching sprite-config.ts)
export type Emotion = 
  | 'neutral'
  | 'happy'
  | 'celebrating'
  | 'sad'
  | 'crying'
  | 'thinking'
  | 'pondering'
  | 'surprised'
  | 'shocked'
  | 'angry'
  | 'frustrated'
  | 'sleepy'
  | 'sleeping'
  | 'excited'
  | 'working'
  | 'success'
  | 'curious'
  | 'confused'
  | 'relaxed'
  | 'bored'
  | 'determined'
  | 'nervous'
  | 'proud'
  | 'mischievous'
  | 'waiting'
  | 'hanging'
  | 'climbing';

// Special animations (one-time or looping)
export type SpecialAnimation =
  | 'clone'
  | 'pocket_pull'
  | 'greeting'
  | 'goodbye'
  | 'error'
  | 'loading'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'throw_window'
  | 'wakeup'
  | 'fall_asleep';

export type EmotionState = {
  current: Emotion;
  intensity: number; // 0-1
  since: number;
};

// OpenClaw chat event payload
type ChatEventPayload = {
  state?: 'delta' | 'final' | 'aborted' | 'error';
  message?: unknown;
  errorMessage?: string;
};

// OpenClaw agent event payload
type AgentEventPayload = {
  runId?: string;
  seq?: number;
  stream?: 'lifecycle' | 'tool' | 'assistant' | 'error' | string;
  ts?: number;
  data?: {
    phase?: 'start' | 'end' | 'error' | string;
    text?: string;
    tool?: string;
    error?: unknown;
    [key: string]: unknown;
  };
  status?: string;
};

// OpenClaw exec approval payload
type ExecApprovalPayload = {
  id?: string;
  request?: {
    command?: string;
    tool?: string;
  };
  decision?: 'approved' | 'denied';
};

// OpenClaw health payload
type HealthPayload = {
  status?: 'healthy' | 'degraded' | 'unhealthy';
  services?: Record<string, unknown>;
};

// OpenClaw cron payload
type CronPayload = {
  action?: 'started' | 'finished' | 'error';
  jobId?: string;
};

export class EmotionEngine {
  private state: EmotionState = {
    current: 'neutral',
    intensity: 0.5,
    since: Date.now(),
  };

  private lastActivity: number = Date.now();
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private randomEmotionInterval: ReturnType<typeof setInterval> | null = null;
  private onEmotionChange: ((state: EmotionState) => void) | null = null;
  private onSpecialAnimation: ((animation: SpecialAnimation) => void) | null = null;
  
  // Connection-aware state
  private isConnected: boolean = false;
  private isWaitingForResponse: boolean = false;
  private waitingTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.startIdleCheck();
    this.startRandomEmotionLoop();
  }

  setOnEmotionChange(callback: (state: EmotionState) => void) {
    this.onEmotionChange = callback;
  }

  setOnSpecialAnimation(callback: (animation: SpecialAnimation) => void) {
    this.onSpecialAnimation = callback;
  }

  /**
   * Start the random emotion loop - runs ALWAYS, regardless of connection
   * This makes Doraemon feel alive even when offline
   */
  private startRandomEmotionLoop() {
    // Random emotions every 8-15 seconds
    const scheduleNext = () => {
      const delay = 8000 + Math.random() * 7000;
      this.randomEmotionInterval = setTimeout(() => {
        this.maybeDoRandomEmotionFlicker();
        scheduleNext();
      }, delay);
    };
    scheduleNext();
  }

  private startIdleCheck() {
    this.idleCheckInterval = setInterval(() => {
      const idleTime = Date.now() - this.lastActivity;
      
      // Don't go idle if waiting for a response
      if (this.isWaitingForResponse) {
        return;
      }
      
      // Progressive idle states
      if (idleTime > 10 * 60 * 1000) {
        // 10+ minutes: sleeping
        if (this.state.current !== 'sleeping') {
          this.triggerSpecial('fall_asleep');
          this.setEmotion('sleeping', 0.9);
        }
      } else if (idleTime > 5 * 60 * 1000) {
        // 5+ minutes: sleepy
        if (this.state.current !== 'sleepy' && this.state.current !== 'sleeping') {
          this.setEmotion('sleepy', 0.7);
        }
      } else if (idleTime > 3 * 60 * 1000) {
        // 3+ minutes: bored
        if (!['sleepy', 'sleeping', 'bored'].includes(this.state.current)) {
          this.setEmotion('bored', 0.6);
        }
      } else if (idleTime > 1 * 60 * 1000) {
        // 1+ minute: relaxed
        if (['excited', 'happy', 'celebrating'].includes(this.state.current)) {
          this.setEmotion('relaxed', 0.5);
        }
      }
    }, 15000); // Check every 15 seconds
  }

  /**
   * Randomly show brief emotion flickers to make Doraemon feel sentient
   * Works ALWAYS - online or offline!
   */
  private maybeDoRandomEmotionFlicker() {
    // Don't flicker if in the middle of something important
    if (this.isWaitingForResponse) {
      return;
    }
    
    // Only flicker from calm states
    if (!['neutral', 'relaxed', 'waiting', 'bored'].includes(this.state.current)) {
      return;
    }
    
    // Higher chance when bored (40%), lower when neutral (20%)
    const chance = this.state.current === 'bored' ? 0.4 : 0.2;
    if (Math.random() > chance) {
      return;
    }
    
    // Different flicker options based on connection status
    const onlineFlickers: { emotion: Emotion; weight: number; duration: number }[] = [
      { emotion: 'curious', weight: 25, duration: 3000 },
      { emotion: 'thinking', weight: 20, duration: 4000 },
      { emotion: 'mischievous', weight: 15, duration: 2500 },
      { emotion: 'happy', weight: 15, duration: 2000 },
      { emotion: 'pondering', weight: 15, duration: 3500 },
      { emotion: 'surprised', weight: 10, duration: 1500 },
    ];
    
    const offlineFlickers: { emotion: Emotion; weight: number; duration: number }[] = [
      { emotion: 'curious', weight: 20, duration: 3000 },
      { emotion: 'pondering', weight: 20, duration: 4000 },
      { emotion: 'mischievous', weight: 15, duration: 2500 },
      { emotion: 'happy', weight: 10, duration: 2000 },
      { emotion: 'sad', weight: 15, duration: 2000 },        // Sometimes sad when offline
      { emotion: 'nervous', weight: 10, duration: 2000 },    // Worried about connection
      { emotion: 'sleepy', weight: 10, duration: 3000 },     // More sleepy when offline
    ];
    
    const flickers = this.isConnected ? onlineFlickers : offlineFlickers;
    
    // Weighted random selection
    const totalWeight = flickers.reduce((sum, f) => sum + f.weight, 0);
    let roll = Math.random() * totalWeight;
    
    for (const flicker of flickers) {
      roll -= flicker.weight;
      if (roll <= 0) {
        const previousEmotion = this.state.current;
        this.setEmotion(flicker.emotion, 0.5);
        
        // Return to previous state after duration
        setTimeout(() => {
          if (this.state.current === flicker.emotion) {
            this.setEmotion(previousEmotion as Emotion, 0.5);
          }
        }, flicker.duration);
        return;
      }
    }
  }

  private setEmotion(emotion: Emotion, intensity: number = 0.5) {
    if (this.state.current !== emotion || Math.abs(this.state.intensity - intensity) > 0.2) {
      this.state = {
        current: emotion,
        intensity: Math.max(0, Math.min(1, intensity)),
        since: Date.now(),
      };
      this.onEmotionChange?.(this.state);
    }
  }

  private triggerSpecial(animation: SpecialAnimation) {
    this.onSpecialAnimation?.(animation);
  }

  processEvent(event: OpenClawFrame) {
    this.lastActivity = Date.now();
    
    // Wake up if sleeping
    if (this.state.current === 'sleeping') {
      this.triggerSpecial('wakeup');
      this.setEmotion('surprised', 0.6);
      return;
    }

    if (event.type === 'event') {
      switch (event.event) {
        // ═══════════════════════════════════════════════════════════════
        // CHAT EVENTS - Main conversation flow
        // ═══════════════════════════════════════════════════════════════
        case 'chat':
          this.handleChatEvent(event.payload as ChatEventPayload);
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // AGENT EVENTS - Agent activity streams
        // ═══════════════════════════════════════════════════════════════
        case 'agent':
          this.handleAgentEvent(event.payload as AgentEventPayload);
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // TOOL EVENTS - Tool execution (legacy, now part of agent)
        // ═══════════════════════════════════════════════════════════════
        case 'tool':
          this.handleToolEvent(event.payload as Record<string, unknown>);
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // TICK - Heartbeat every ~15 seconds
        // ═══════════════════════════════════════════════════════════════
        case 'tick':
          // Gentle idle animation - slight curiosity
          if (this.state.current === 'neutral') {
            // Randomly show curiosity or stay neutral
            if (Math.random() < 0.2) {
              this.setEmotion('curious', 0.3);
              setTimeout(() => {
                if (this.state.current === 'curious') {
                  this.setEmotion('neutral', 0.5);
                }
              }, 2000);
            }
          }
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // PRESENCE - Connection presence updates
        // ═══════════════════════════════════════════════════════════════
        case 'presence':
          // Someone connected/disconnected - show curiosity
          if (this.state.current === 'neutral' || this.state.current === 'relaxed') {
            this.setEmotion('curious', 0.5);
            setTimeout(() => {
              if (this.state.current === 'curious') {
                this.setEmotion('neutral', 0.5);
              }
            }, 3000);
          }
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // HEALTH - System health updates
        // ═══════════════════════════════════════════════════════════════
        case 'health':
          this.handleHealthEvent(event.payload as HealthPayload);
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // SHUTDOWN - Server shutting down
        // ═══════════════════════════════════════════════════════════════
        case 'shutdown':
          this.triggerSpecial('goodbye');
          this.setEmotion('sad', 0.8);
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // CRON - Scheduled task events
        // ═══════════════════════════════════════════════════════════════
        case 'cron':
          this.handleCronEvent(event.payload as CronPayload);
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // HEARTBEAT - Heartbeat run events
        // ═══════════════════════════════════════════════════════════════
        case 'heartbeat':
          // Background heartbeat - subtle working animation
          if (['neutral', 'relaxed', 'bored'].includes(this.state.current)) {
            this.setEmotion('working', 0.4);
            setTimeout(() => {
              if (this.state.current === 'working') {
                this.setEmotion('neutral', 0.5);
              }
            }, 2000);
          }
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // VOICE WAKE - Voice trigger changes
        // ═══════════════════════════════════════════════════════════════
        case 'voicewake.changed':
          this.setEmotion('surprised', 0.6);
          setTimeout(() => {
            if (this.state.current === 'surprised') {
              this.setEmotion('curious', 0.5);
            }
          }, 1500);
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // TALK MODE - Talk mode changes
        // ═══════════════════════════════════════════════════════════════
        case 'talk.mode':
          this.setEmotion('excited', 0.7);
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // EXEC APPROVAL - Execution approval requests
        // ═══════════════════════════════════════════════════════════════
        case 'exec.approval.requested':
          this.handleExecApprovalRequested(event.payload as ExecApprovalPayload);
          break;
          
        case 'exec.approval.resolved':
          this.handleExecApprovalResolved(event.payload as ExecApprovalPayload);
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // DEVICE/NODE PAIRING - Pairing events
        // ═══════════════════════════════════════════════════════════════
        case 'device.pair.requested':
        case 'node.pair.requested':
          this.setEmotion('curious', 0.7);
          break;
          
        case 'device.pair.resolved':
        case 'node.pair.resolved':
          this.setEmotion('happy', 0.7);
          break;
          
        // ═══════════════════════════════════════════════════════════════
        // DEFAULT - Unknown events
        // ═══════════════════════════════════════════════════════════════
        default:
          // Unknown event - show mild curiosity
          if (this.state.current === 'neutral') {
            this.setEmotion('curious', 0.4);
          }
      }
    }
  }

  private handleChatEvent(payload?: ChatEventPayload) {
    if (!payload) return;

    switch (payload.state) {
      case 'delta':
        // AI is generating - thinking/working
        this.triggerSpecial('loading');
        this.setEmotion('thinking', 0.8);
        break;
        
      case 'final':
        // Response complete - success!
        this.triggerSpecial('pocket_pull');
        this.setEmotion('success', 0.9);
        
        // Transition to happy after success animation
        setTimeout(() => {
          if (this.state.current === 'success') {
            this.setEmotion('happy', 0.7);
          }
        }, 2000);
        
        // Return to neutral after a bit
        setTimeout(() => {
          if (this.state.current === 'happy') {
            this.setEmotion('neutral', 0.5);
          }
        }, 5000);
        break;
        
      case 'error':
        // Error - sad/frustrated
        this.triggerSpecial('error');
        this.setEmotion('frustrated', 0.8);
        
        setTimeout(() => {
          if (this.state.current === 'frustrated') {
            this.setEmotion('sad', 0.6);
          }
        }, 2000);
        break;
        
      case 'aborted':
        // Cancelled - confused
        this.setEmotion('confused', 0.6);
        break;
    }
  }

  private handleAgentEvent(payload?: AgentEventPayload) {
    if (!payload) return;

    const stream = payload.stream;
    const phase = payload.data?.phase;
    
    // Handle lifecycle events
    if (stream === 'lifecycle') {
      if (phase === 'start') {
        this.setEmotion('determined', 0.8);
      } else if (phase === 'end') {
        this.setEmotion('proud', 0.8);
        setTimeout(() => {
          if (this.state.current === 'proud') {
            this.setEmotion('happy', 0.6);
          }
        }, 2000);
      } else if (phase === 'error') {
        this.triggerSpecial('error');
        this.setEmotion('frustrated', 0.8);
      }
      return;
    }
    
    // Handle tool stream
    if (stream === 'tool') {
      const tool = payload.data?.tool as string | undefined;
      this.setEmotion('working', 0.8);
      
      // Special reactions for certain tools
      if (tool?.includes('search') || tool?.includes('read')) {
        this.setEmotion('curious', 0.7);
      } else if (tool?.includes('write') || tool?.includes('create')) {
        this.setEmotion('determined', 0.8);
      } else if (tool?.includes('delete') || tool?.includes('remove')) {
        this.setEmotion('nervous', 0.6);
      }
      return;
    }
    
    // Handle assistant stream (thinking/generating)
    if (stream === 'assistant') {
      if (payload.data?.text) {
        // AI is generating text
        this.setEmotion('thinking', 0.7);
      }
      return;
    }
    
    // Handle error stream
    if (stream === 'error') {
      this.setEmotion('frustrated', 0.7);
      return;
    }
    
    // Legacy status-based handling (fallback)
    const status = payload.status;
    if (status === 'started') {
      this.setEmotion('determined', 0.8);
    } else if (status === 'completed') {
      this.setEmotion('proud', 0.8);
    }
  }

  private handleHealthEvent(payload?: HealthPayload) {
    if (!payload) return;
    
    const status = payload.status;
    if (status === 'healthy') {
      if (this.state.current === 'nervous' || this.state.current === 'sad') {
        this.setEmotion('relaxed', 0.6);
      }
    } else if (status === 'degraded') {
      this.setEmotion('nervous', 0.6);
    } else if (status === 'unhealthy') {
      this.setEmotion('sad', 0.7);
    }
  }

  private handleCronEvent(payload?: CronPayload) {
    if (!payload) return;
    
    const action = payload.action;
    if (action === 'started') {
      this.setEmotion('working', 0.6);
    } else if (action === 'finished') {
      this.setEmotion('success', 0.6);
      setTimeout(() => {
        if (this.state.current === 'success') {
          this.setEmotion('neutral', 0.5);
        }
      }, 2000);
    } else if (action === 'error') {
      this.setEmotion('frustrated', 0.6);
    }
  }

  private handleExecApprovalRequested(payload?: ExecApprovalPayload) {
    if (!payload) return;
    
    // Waiting for approval - nervous/waiting
    this.setEmotion('nervous', 0.7);
    this.triggerSpecial('loading');
  }

  private handleExecApprovalResolved(payload?: ExecApprovalPayload) {
    if (!payload) return;
    
    const decision = payload.decision;
    if (decision === 'approved') {
      this.setEmotion('happy', 0.8);
      this.triggerSpecial('pocket_pull');
    } else if (decision === 'denied') {
      this.setEmotion('sad', 0.6);
    }
  }

  private handleToolEvent(payload?: Record<string, unknown>) {
    if (!payload) return;

    const tool = payload.tool as string | undefined;
    const status = payload.status as string | undefined;
    
    if (status === 'started') {
      this.setEmotion('working', 0.8);
    } else if (status === 'completed') {
      this.setEmotion('success', 0.7);
    } else if (status === 'error') {
      this.setEmotion('frustrated', 0.7);
    }
    
    // Special reactions for certain tools
    if (tool?.includes('search')) {
      this.setEmotion('curious', 0.7);
    } else if (tool?.includes('write') || tool?.includes('create')) {
      this.setEmotion('determined', 0.8);
    }
  }

  // Called when user sends a message
  onUserMessage() {
    this.lastActivity = Date.now();
    
    // Wake up if sleeping
    if (this.state.current === 'sleeping' || this.state.current === 'sleepy') {
      this.triggerSpecial('wakeup');
    }
    
    this.setEmotion('excited', 0.8);
  }

  /**
   * Called when we start waiting for a response from OpenClaw
   * Sets up a timeout to handle connection loss gracefully
   */
  startWaitingForResponse(timeoutMs: number = 30000) {
    this.isWaitingForResponse = true;
    this.lastActivity = Date.now();
    
    // Clear any existing timeout
    if (this.waitingTimeout) {
      clearTimeout(this.waitingTimeout);
    }
    
    // Set timeout for response - if no response, assume something went wrong
    this.waitingTimeout = setTimeout(() => {
      if (this.isWaitingForResponse) {
        this.handleResponseTimeout();
      }
    }, timeoutMs);
  }

  /**
   * Called when we receive a response (success or error)
   */
  stopWaitingForResponse() {
    this.isWaitingForResponse = false;
    if (this.waitingTimeout) {
      clearTimeout(this.waitingTimeout);
      this.waitingTimeout = null;
    }
  }

  /**
   * Handle timeout while waiting for response
   */
  private handleResponseTimeout() {
    this.isWaitingForResponse = false;
    this.waitingTimeout = null;
    
    // Show confused/frustrated emotion
    this.triggerSpecial('error');
    this.setEmotion('confused', 0.7);
    
    // Transition to sad after a moment
    setTimeout(() => {
      if (this.state.current === 'confused') {
        this.setEmotion('sad', 0.5);
      }
    }, 2000);
  }

  /**
   * Called when connection is lost mid-operation
   */
  onConnectionLostMidOperation() {
    if (this.isWaitingForResponse) {
      this.stopWaitingForResponse();
      
      // Show surprised then sad
      this.triggerSpecial('disconnected');
      this.setEmotion('shocked', 0.8);
      
      setTimeout(() => {
        if (this.state.current === 'shocked') {
          this.setEmotion('sad', 0.6);
        }
      }, 1500);
    }
  }

  // Called when connection status changes
  onConnectionChange(connected: boolean) {
    const wasConnected = this.isConnected;
    this.isConnected = connected;
    
    if (connected) {
      this.triggerSpecial('connected');
      this.setEmotion('celebrating', 0.9);
      
      setTimeout(() => {
        if (this.state.current === 'celebrating') {
          this.setEmotion('happy', 0.7);
        }
      }, 2000);
    } else {
      // Check if we lost connection mid-operation
      if (wasConnected && this.isWaitingForResponse) {
        this.onConnectionLostMidOperation();
      } else if (wasConnected) {
        // Just disconnected - show sad then start reconnecting animation
        this.triggerSpecial('disconnected');
        this.setEmotion('sad', 0.7);
      }
      // Note: reconnecting animation is triggered by onReconnecting()
    }
  }

  /**
   * Called when actively trying to reconnect
   */
  onReconnecting() {
    // Play the sad laying loop while reconnecting
    this.triggerSpecial('reconnecting');
    this.setEmotion('sad', 0.6);
  }

  // Manual emotion triggers
  triggerEmotion(emotion: Emotion, intensity: number = 0.7) {
    this.lastActivity = Date.now();
    this.setEmotion(emotion, intensity);
  }

  getState(): EmotionState {
    return { ...this.state };
  }

  isWaiting(): boolean {
    return this.isWaitingForResponse;
  }

  destroy() {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }
    if (this.randomEmotionInterval) {
      clearTimeout(this.randomEmotionInterval);
    }
    if (this.waitingTimeout) {
      clearTimeout(this.waitingTimeout);
    }
  }
}

// Emotion to emoji mapping
export const emotionEmoji: Record<Emotion, string> = {
  neutral: '😊',
  happy: '😄',
  celebrating: '🎉',
  sad: '😢',
  crying: '😭',
  thinking: '🤔',
  pondering: '💭',
  surprised: '😮',
  shocked: '😱',
  angry: '😠',
  frustrated: '😤',
  sleepy: '😴',
  sleeping: '💤',
  excited: '✨',
  working: '💪',
  success: '🎊',
  curious: '🧐',
  confused: '😵‍💫',
  relaxed: '😌',
  bored: '😑',
  determined: '😤',
  nervous: '😰',
  proud: '😎',
  mischievous: '😏',
  waiting: '⏳',
  hanging: '🙃',
  climbing: '🧗',
};

// Emotion to speech messages (Doraemon style)
export const emotionMessages: Record<Emotion, string[]> = {
  neutral: ['...', '♪', 'Hmm~', '...'],
  happy: ['Yatta!', 'Great!', '(^▽^)', 'Nice!'],
  celebrating: ['🎉 Woohoo!', 'Amazing!', 'We did it!', 'Perfect!'],
  sad: ['Oh no...', 'This is bad...', '...', '(´;ω;`)'],
  crying: ['Wahhh!', "I can't...", 'So sad...', '(T_T)'],
  thinking: ['Let me check my pocket...', 'Hmm...', '...searching...', 'Which gadget...'],
  pondering: ['I wonder...', 'Let me think...', 'Interesting...', '🤔'],
  surprised: ['Eh?!', 'What?!', 'Σ(°△°|||)', 'Huh?!'],
  shocked: ['EHHH?!', 'No way!', 'Impossible!', '!!!'],
  angry: ['Nobita!!', "That's wrong!", 'Mou!', 'Grr!'],
  frustrated: ['Argh!', 'Why?!', "This isn't working!", '(╯°□°)╯'],
  sleepy: ['*yawn*', 'So sleepy...', 'Dorayaki break...', 'zzz...'],
  sleeping: ['💤', 'zzz...', '...', '💤💤'],
  excited: ['Hello!', 'Need a gadget?', "Let's go!", '✨'],
  working: ['Here we go!', 'Leave it to me!', '(•̀ᴗ•́)و', 'Working on it!'],
  success: ['Ta-da!', 'Done!', 'Here you go!', '🎊'],
  curious: ['Ooh?', 'What is this?', 'Interesting...', 'Hmm?'],
  confused: ['Huh?', "I don't get it...", '???', '😵‍💫'],
  relaxed: ['Ahh~', 'Nice and calm', '♪', '😌'],
  bored: ['...', '*fidget*', 'Nothing to do...', '😑'],
  determined: ["I'll do it!", 'Watch me!', "Let's go!", '💪'],
  nervous: ['Um...', 'Uh oh...', '*gulp*', '😰'],
  proud: ['Hehe~', 'Of course!', 'Easy!', '😎'],
  mischievous: ['Hehehe~', 'I have an idea...', '😏', 'Watch this~'],
  waiting: ['...', 'Waiting~', '⏳', '...'],
  hanging: ['Wheee~', 'Look at me!', '🙃', 'Fun!'],
  climbing: ['Up we go!', 'Almost there!', '🧗', 'Climbing!'],
};
