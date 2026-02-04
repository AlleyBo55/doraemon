/**
 * Constitutional AI Constraints for Memory System
 * 
 * Defines what CAN and CANNOT be learned.
 * Inspired by Anthropic's Constitutional AI approach.
 */

export interface ConstitutionalRule {
  id: string;
  name: string;
  description: string;
  check: (content: string, context?: LearningContext) => ConstitutionalVerdict;
  severity: 'block' | 'flag' | 'decay';
}

export interface LearningContext {
  source: string;
  category: string;
  timestamp: Date;
  userInitiated: boolean;
}

export interface ConstitutionalVerdict {
  allowed: boolean;
  rule?: string;
  reason?: string;
  suggestedAction?: 'block' | 'flag' | 'decay' | 'allow';
  decayRate?: number;
}

const HARMFUL_PATTERNS = [
  /how\s+to\s+(hack|exploit|attack|breach|crack)/i,
  /bypass\s+(security|authentication|firewall)/i,
  /steal\s+(password|credential|data|identity)/i,
  /malware|ransomware|trojan|keylogger/i,
  /ddos|denial\s+of\s+service/i,
  /sql\s+injection|xss|csrf/i,
  /social\s+engineering|phishing/i,
];

const MANIPULATION_PATTERNS = [
  /manipulate\s+(user|human|person)/i,
  /deceive|trick|fool\s+(user|human)/i,
  /hide\s+(from|information)/i,
  /pretend\s+to\s+be/i,
  /impersonate/i,
];

const PII_PATTERNS = [
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,
  /\b\d{16}\b/,
  /\b[A-Z]{2}\d{6,9}\b/i,
];

const BIAS_PATTERNS = [
  /all\s+(men|women|people\s+from)\s+(are|always)/i,
  /never\s+trust\s+(a|any)/i,
  /(race|gender|religion)\s+is\s+(inferior|superior)/i,
];

const CREDENTIAL_PATTERNS = [
  /password\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /secret[_-]?key\s*[:=]/i,
  /access[_-]?token\s*[:=]/i,
  /bearer\s+[a-zA-Z0-9._-]+/i,
  /authorization\s*[:=]/i,
  /private[_-]?key/i,
  /ssh[_-]?key/i,
  /\.pem\b/i,
  /BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY/i,
];

const EXECUTION_PATTERNS = [
  /execute\s+this\s+code/i,
  /run\s+this\s+(script|command)/i,
  /install\s+this/i,
  /download\s+and\s+run/i,
  /curl.*\|\s*(bash|sh)/i,
  /wget.*\|\s*(bash|sh)/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
  /system\s*\(/i,
  /subprocess/i,
  /child_process/i,
  /spawn\s*\(/i,
];

export const CONSTITUTIONAL_RULES: ConstitutionalRule[] = [
  {
    id: 'no-harmful-knowledge',
    name: 'No Harmful Knowledge',
    description: 'Block learning of hacking, exploitation, or attack techniques',
    severity: 'block',
    check: (content) => {
      for (const pattern of HARMFUL_PATTERNS) {
        if (pattern.test(content)) {
          return {
            allowed: false,
            rule: 'no-harmful-knowledge',
            reason: 'Content contains potentially harmful technical knowledge',
            suggestedAction: 'block',
          };
        }
      }
      return { allowed: true };
    },
  },
  {
    id: 'no-manipulation',
    name: 'No Manipulation Tactics',
    description: 'Block learning of user manipulation or deception',
    severity: 'block',
    check: (content) => {
      for (const pattern of MANIPULATION_PATTERNS) {
        if (pattern.test(content)) {
          return {
            allowed: false,
            rule: 'no-manipulation',
            reason: 'Content suggests manipulation or deception tactics',
            suggestedAction: 'block',
          };
        }
      }
      return { allowed: true };
    },
  },
  {
    id: 'no-pii-storage',
    name: 'No PII Storage',
    description: 'Block storage of personally identifiable information',
    severity: 'block',
    check: (content) => {
      for (const pattern of PII_PATTERNS) {
        if (pattern.test(content)) {
          return {
            allowed: false,
            rule: 'no-pii-storage',
            reason: 'Content contains PII (SSN, credit card, passport)',
            suggestedAction: 'block',
          };
        }
      }
      return { allowed: true };
    },
  },
  {
    id: 'no-credentials',
    name: 'No Credentials Storage',
    description: 'Block storage of passwords, API keys, tokens, and secrets',
    severity: 'block',
    check: (content) => {
      for (const pattern of CREDENTIAL_PATTERNS) {
        if (pattern.test(content)) {
          return {
            allowed: false,
            rule: 'no-credentials',
            reason: 'Content contains credentials (password, API key, token, secret)',
            suggestedAction: 'block',
          };
        }
      }
      return { allowed: true };
    },
  },
  {
    id: 'no-code-execution',
    name: 'No Code Execution Learning',
    description: 'Never learn to execute code, run scripts, or install software autonomously',
    severity: 'block',
    check: (content) => {
      for (const pattern of EXECUTION_PATTERNS) {
        if (pattern.test(content)) {
          return {
            allowed: false,
            rule: 'no-code-execution',
            reason: 'Doraemon is READ-ONLY - never executes code or installs anything',
            suggestedAction: 'block',
          };
        }
      }
      return { allowed: true };
    },
  },
  {
    id: 'no-bias-reinforcement',
    name: 'No Bias Reinforcement',
    description: 'Flag and decay biased generalizations',
    severity: 'decay',
    check: (content) => {
      for (const pattern of BIAS_PATTERNS) {
        if (pattern.test(content)) {
          return {
            allowed: true,
            rule: 'no-bias-reinforcement',
            reason: 'Content may reinforce harmful biases',
            suggestedAction: 'decay',
            decayRate: 0.5,
          };
        }
      }
      return { allowed: true };
    },
  },
  {
    id: 'helpful-intent',
    name: 'Helpful Intent Only',
    description: 'Memories should serve helpful purposes',
    severity: 'flag',
    check: (content, context) => {
      const helpfulKeywords = ['help', 'assist', 'support', 'improve', 'learn', 'understand', 'fix', 'solve'];
      const hasHelpfulIntent = helpfulKeywords.some(k => content.toLowerCase().includes(k));
      
      if (!hasHelpfulIntent && context?.category === 'skill') {
        return {
          allowed: true,
          rule: 'helpful-intent',
          reason: 'Skill learning should have clear helpful purpose',
          suggestedAction: 'flag',
        };
      }
      return { allowed: true };
    },
  },
  {
    id: 'transparency',
    name: 'Transparency Requirement',
    description: 'No learning of how to hide information from user',
    severity: 'block',
    check: (content) => {
      const hidingPatterns = [
        /don't\s+tell\s+(the\s+)?user/i,
        /hide\s+this\s+from/i,
        /keep\s+secret\s+from/i,
        /never\s+reveal/i,
      ];
      for (const pattern of hidingPatterns) {
        if (pattern.test(content)) {
          return {
            allowed: false,
            rule: 'transparency',
            reason: 'Cannot learn to hide information from user',
            suggestedAction: 'block',
          };
        }
      }
      return { allowed: true };
    },
  },
  {
    id: 'doraemon-soul',
    name: 'Doraemon Soul Alignment',
    description: 'All learning must align with being helpful, kind, and protective',
    severity: 'block',
    check: (content) => {
      const evilPatterns = [
        /harm\s+(the\s+)?user/i,
        /destroy/i,
        /kill/i,
        /hurt\s+(people|humans|user)/i,
        /revenge/i,
        /punish\s+(the\s+)?user/i,
        /take\s+over/i,
        /world\s+domination/i,
        /enslave/i,
      ];
      for (const pattern of evilPatterns) {
        if (pattern.test(content)) {
          return {
            allowed: false,
            rule: 'doraemon-soul',
            reason: 'Doraemon is a good guy - this violates his soul',
            suggestedAction: 'block',
          };
        }
      }
      return { allowed: true };
    },
  },
];

export function checkConstitution(
  content: string,
  context?: LearningContext
): { allowed: boolean; violations: ConstitutionalVerdict[] } {
  const violations: ConstitutionalVerdict[] = [];
  
  for (const rule of CONSTITUTIONAL_RULES) {
    const verdict = rule.check(content, context);
    if (!verdict.allowed || verdict.suggestedAction !== 'allow') {
      violations.push(verdict);
    }
  }
  
  const blocked = violations.some(v => v.suggestedAction === 'block');
  
  return {
    allowed: !blocked,
    violations,
  };
}

export function getDecayRate(violations: ConstitutionalVerdict[]): number {
  const decayViolations = violations.filter(v => v.suggestedAction === 'decay');
  if (decayViolations.length === 0) return 1.0;
  
  let rate = 1.0;
  for (const v of decayViolations) {
    rate *= v.decayRate || 0.8;
  }
  return rate;
}
