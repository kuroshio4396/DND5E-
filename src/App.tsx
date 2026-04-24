import { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Dices, Copy, CheckCheck, Sparkles, ScrollText, AlertCircle, Loader2, Shield, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Interaction {
  skill: string;
  dc: number;
  action: string;
  success: string;
  failure: string;
}

export default function App() {
  const [scene, setScene] = useState('');
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [generationMode, setGenerationMode] = useState<'skill' | 'identity'>('skill');

  const [showSettings, setShowSettings] = useState(false);
  const [customProvider, setCustomProvider] = useState<'gemini' | 'deepseek'>('gemini');
  const [customApiKey, setCustomApiKey] = useState('');
  const [tempProvider, setTempProvider] = useState<'gemini' | 'deepseek'>('gemini');
  const [tempApiKey, setTempApiKey] = useState('');

  useEffect(() => {
    const savedProvider = localStorage.getItem('dnd_generator_provider') as 'gemini' | 'deepseek';
    const savedKey = localStorage.getItem('dnd_generator_apiKey');
    if (savedProvider) setCustomProvider(savedProvider);
    if (savedKey) setCustomApiKey(savedKey);
  }, []);

  const openSettings = () => {
    setTempProvider(customProvider);
    setTempApiKey(customApiKey);
    setShowSettings(true);
  };

  const saveSettings = () => {
    setCustomProvider(tempProvider);
    setCustomApiKey(tempApiKey);
    localStorage.setItem('dnd_generator_provider', tempProvider);
    localStorage.setItem('dnd_generator_apiKey', tempApiKey);
    setShowSettings(false);
  };

  const handleGenerate = async () => {
    if (!scene.trim()) {
      setError('请输入场景描述。');
      return;
    }

    setLoading(true);
    setError(null);
    setInteractions([]);
    setCopiedIndex(null);
    setCopiedAll(false);

    try {
      const promptContent = generationMode === 'skill' 
        ? `你是一个专业的DND 5E地下城主（DM）和《博德之门3》的关卡设计师。
请根据我提供的场景描述，设计3到6个合理的、基于DND 5E技能的环境交互选项。
这些选项应该像《博德之门3》中的对话/交互选项一样，包含技能名称、难度等级（DC）、玩家的交互动作描述，以及成功和失败的详细后果。
技能名称请严格使用DND 5E官方中文译名（如：察觉、调查、自然、奥秘、运动、体操、巧手、隐匿、医药、历史、宗教、洞悉、欺瞒、威吓、游说、表演、驯兽、生存）。
难度等级（DC）应根据动作的合理难度设定（通常在10到25之间）。

场景描述：
${scene}`
        : `你是一个专业的DND 5E地下城主（DM）和《博德之门3》的关卡设计师。
请根据我提供的场景描述，设计3到6个合理的、基于特定的DND 5E“职业”或“出身背景”的环境交互选项。
这些选项应该像《博德之门3》中的专属对话/交互选项一样（如：[圣武士]、[野蛮人]、[游荡者]、[贵族]、[工匠] 等），体现特定身份在场景中独特的观察角度与行动特权。
包含职业/背景名称、难度等级（DC，若是依赖检定则设在10-25之间；若是职业特权必定成功，可设为0）、玩家的交互动作描述，以及成功和失败的详细后果（若DC为0，在成功中写明后果，失败填“无”）。

场景描述：
${scene}`;

      if (customApiKey && customProvider === 'deepseek') {
        const enhancedPrompt = promptContent + `\n\n请务必严格按照JSON格式输出，只需返回一个合法的JSON对象（不要输出markdown代码块包裹）。返回格式示例：\n{"interactions": [\n  {"skill": "具体技能", "dc": 15, "action": "动作描述", "success": "成功结果", "failure": "失败结果"}\n]}`;
        
        const res = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${customApiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: enhancedPrompt }],
            response_format: { type: 'json_object' },
            temperature: 0.7
          })
        });
        
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`DeepSeek API Error: ${res.status} ${errData.error?.message || ''}`);
        }
        
        const data = await res.json();
        let rawText = data.choices[0].message.content;
        rawText = rawText.trim();
        if (rawText.startsWith('```json')) {
            rawText = rawText.substring(7);
            if (rawText.endsWith('```')) rawText = rawText.substring(0, rawText.length - 3);
        }
        rawText = rawText.trim();
        
        const parsed = JSON.parse(rawText);
        setInteractions(parsed.interactions || parsed);
      } else {
        const activeKey = (customProvider === 'gemini' && customApiKey) ? customApiKey : process.env.GEMINI_API_KEY;
        
        if (!activeKey) {
          throw new Error('运行环境未检测到默认 API 秘钥。请点击右上角“设定”手动配置您的专属 API 秘钥。');
        }

        const runtimeAi = new GoogleGenAI({ apiKey: activeKey });
        const response = await runtimeAi.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: promptContent,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  skill: { type: Type.STRING, description: generationMode === 'skill' ? 'DND 5E技能名称，例如：察觉' : '职业或背景名称，例如：圣武士 / 贵族' },
                  dc: { type: Type.INTEGER, description: '难度等级 (DC)' },
                  action: { type: Type.STRING, description: '玩家的交互动作描述' },
                  success: { type: Type.STRING, description: '检定成功的结果' },
                  failure: { type: Type.STRING, description: '检定失败的结果' },
                },
                required: ['skill', 'dc', 'action', 'success', 'failure'],
              },
            },
          },
        });

        if (response.text) {
          const parsed = JSON.parse(response.text) as Interaction[];
          setInteractions(parsed);
        } else {
          throw new Error('未收到有效的生成结果。');
        }
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || '生成交互选项时发生错误，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const formatInteraction = (item: Interaction) => {
    const dcText = item.dc > 0 ? ` ${item.dc}` : '';
    return `【${item.skill}${dcText}】${item.action}\n  -> 成功：${item.success}\n  -> 失败：${item.failure}`;
  };

  const handleCopy = async (index: number, item: Interaction) => {
    const text = formatInteraction(item);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleCopyAll = async () => {
    if (interactions.length === 0) return;
    const text = interactions.map(formatInteraction).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="h-screen flex flex-col selection:bg-[var(--color-accent-gold)]/50 selection:text-white overflow-hidden">
      {/* Header */}
      <header className="h-[70px] px-10 flex items-center justify-between border-b border-[var(--color-glass-border)] bg-black/30 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl tracking-[2px] text-[var(--color-accent-gold)] uppercase font-light">
            环境交互生成器 <small className="text-xs opacity-60 ml-2.5 normal-case tracking-normal">BG3 样式适配层</small>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[var(--color-text-secondary)] text-xs hidden md:block">
            当前系统: D&D 5E
          </div>
          <button 
            onClick={openSettings}
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm border border-[var(--color-glass-border)] text-[var(--color-text-secondary)] bg-transparent hover:bg-black/40 hover:text-[var(--color-accent-gold)] transition-colors text-xs cursor-pointer"
            title="API 秘钥配置"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">设定</span>
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-5 p-6 flex-1 min-h-0">
        {/* Left Column: Input */}
        <div className="flex flex-col h-full min-h-0">
          <div className="bg-[var(--color-glass-bg)] backdrop-blur-md border border-[var(--color-glass-border)] rounded p-6 flex flex-col relative h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs uppercase text-[var(--color-accent-gold)] tracking-[1px] font-semibold flex items-center gap-2">
                <span className="inline-block w-1 h-1 bg-[var(--color-accent-gold)] rotate-45"></span>
                场景描述输入
              </div>
            </div>

            <div className="flex bg-black/40 rounded p-1 mb-4 border border-[var(--color-glass-border)] w-full">
              <button
                onClick={() => setGenerationMode('skill')}
                className={`flex-1 py-2 text-[13px] rounded-sm transition-all flex justify-center items-center gap-2 ${generationMode === 'skill' ? 'bg-[var(--color-accent-gold)] text-black font-bold shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
              >
                <Dices className="w-4 h-4" />
                技能检定导向
              </button>
              <button
                onClick={() => setGenerationMode('identity')}
                className={`flex-1 py-2 text-[13px] rounded-sm transition-all flex justify-center items-center gap-2 ${generationMode === 'identity' ? 'bg-[var(--color-accent-gold)] text-black font-bold shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
              >
                <Shield className="w-4 h-4" />
                身份职业导向
              </button>
            </div>
            
            <textarea
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              placeholder="输入当前的跑团场景描述，例如：玩家来到了一处阴暗的祭坛前，四周长满了发光的蓝色蘑菇，石柱上刻满了扭曲的铭文..."
              className="bg-black/40 border border-white/10 text-[var(--color-text-primary)] p-4 resize-none flex-1 text-sm leading-relaxed rounded outline-none focus:border-[var(--color-accent-gold)] transition-colors placeholder:text-[var(--color-text-secondary)]/50"
            />

            {error && (
              <div className="mt-4 p-3 bg-red-950/30 border border-red-900/50 rounded flex items-start gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={loading || !scene.trim()}
              className="mt-4 bg-[var(--color-accent-gold)] text-[#1a1a1a] border-none p-3 font-semibold cursor-pointer uppercase tracking-[1px] transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 rounded-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>正在推导交互...</span>
                </>
              ) : (
                <>
                  <span>生成交互方案</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="flex flex-col h-full min-h-0">
          <div className="bg-[var(--color-glass-bg)] backdrop-blur-md border border-[var(--color-glass-border)] rounded p-6 flex flex-col relative h-full">
            <div className="text-xs uppercase text-[var(--color-accent-gold)] mb-4 tracking-[1px] font-semibold flex items-center gap-2 shrink-0">
              <span className="inline-block w-1 h-1 bg-[var(--color-accent-gold)] rotate-45"></span>
              生成的环境交互方案
            </div>

            <div className="output-scroll flex-1 overflow-y-auto pr-2.5 min-h-0">
              {interactions.length === 0 && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-[var(--color-text-secondary)] border border-dashed border-white/10 rounded bg-black/20 min-h-[200px]">
                  <Dices className="w-12 h-12 mb-3 opacity-20" />
                  <p>输入场景描述并点击生成，这里将显示可用的技能检定选项。</p>
                </div>
              )}

              <AnimatePresence>
                {interactions.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-[var(--color-check-bg)] border-l-[3px] border-[var(--color-accent-gold)] mb-4 p-4 relative"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[var(--color-accent-gold)] font-semibold text-sm flex items-center gap-2">
                        <span className="d20-icon shrink-0"></span>
                        {index + 1}. [{item.skill}] {item.action.split('。')[0]}
                      </span>
                      <span className="font-mono bg-black/30 px-2 py-0.5 rounded-full text-xs shrink-0">
                        {item.dc > 0 ? `DC ${item.dc}` : '无需检定'}
                      </span>
                    </div>
                    <p className="text-[15px] leading-relaxed mb-3 text-[var(--color-text-primary)]">
                      {item.action}
                    </p>
                    
                    <div className="flex flex-col gap-2 mb-2">
                      <div className="bg-black/20 p-2.5 rounded text-[13px] text-[var(--color-text-secondary)] border border-dashed border-white/10">
                        <strong className="text-[var(--color-text-primary)] font-bold">成功结果：</strong> {item.success}
                      </div>
                      <div className="bg-black/20 p-2.5 rounded text-[13px] text-[var(--color-text-secondary)] border border-dashed border-white/10">
                        <strong className="text-[var(--color-text-primary)] font-bold">失败结果：</strong> {item.failure}
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopy(index, item)}
                      className="bg-transparent border border-[var(--color-accent-gold)]/40 text-[var(--color-accent-gold)] text-[11px] px-2 py-1 cursor-pointer mt-2 transition-all hover:bg-[var(--color-accent-gold)] hover:text-black flex items-center gap-1 w-fit"
                    >
                      {copiedIndex === index ? (
                        <><CheckCheck className="w-3 h-3" /> 已复制</>
                      ) : (
                        <><Copy className="w-3 h-3" /> 复制描述</>
                      )}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {interactions.length > 0 && (
              <div className="mt-5 flex gap-3 justify-end shrink-0">
                <button
                  onClick={() => setInteractions([])}
                  className="bg-transparent border border-[var(--color-accent-gold)] text-[var(--color-accent-gold)] px-5 py-2 cursor-pointer text-[13px] hover:bg-[var(--color-accent-gold)]/10 transition-colors"
                >
                  重置
                </button>
                <button
                  onClick={handleCopyAll}
                  className="bg-[var(--color-accent-gold)] border border-[var(--color-accent-gold)] text-black px-5 py-2 cursor-pointer text-[13px] font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  {copiedAll ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedAll ? '已复制全部' : '一键复制所有内容'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#121110] border border-[var(--color-glass-border)] rounded shadow-2xl p-6 w-full max-w-md relative"
            >
              <div className="flex justify-between items-center mb-6 border-b border-[var(--color-glass-border)] pb-3">
                <h3 className="text-lg font-serif font-semibold text-[var(--color-accent-gold)] flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  API 秘钥配置
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-[var(--color-text-secondary)] hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5">
                 <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-2 tracking-wide">
                     选择 AI 供应商
                   </label>
                   <div className="flex bg-black/40 rounded p-1 border border-[var(--color-glass-border)]">
                     <button
                       onClick={() => setTempProvider('gemini')}
                       className={`flex-1 py-2 text-xs rounded-sm transition-all flex justify-center items-center gap-2 cursor-pointer ${tempProvider === 'gemini' ? 'bg-[var(--color-accent-gold)] text-black font-bold shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                     >
                       Google Gemini
                     </button>
                     <button
                       onClick={() => setTempProvider('deepseek')}
                       className={`flex-1 py-2 text-xs rounded-sm transition-all flex justify-center items-center gap-2 cursor-pointer ${tempProvider === 'deepseek' ? 'bg-[var(--color-accent-gold)] text-black font-bold shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                     >
                       DeepSeek
                     </button>
                   </div>
                 </div>

                 <div>
                   <label className="block text-xs font-semibold text-[var(--color-text-primary)] mb-2 tracking-wide">
                     API 秘钥 (可选)
                   </label>
                   <input
                     type="password"
                     value={tempApiKey}
                     onChange={(e) => setTempApiKey(e.target.value)}
                     placeholder="输入您的自定义秘钥 (sk-...)"
                     className="w-full bg-black/40 border border-[var(--color-glass-border)] text-sm text-[var(--color-text-primary)] px-3 py-2.5 rounded focus:outline-none focus:border-[var(--color-accent-gold)] transition-colors placeholder:text-[var(--color-text-secondary)]/50"
                   />
                   <p className="text-[10px] text-[var(--color-text-secondary)] mt-2 leading-relaxed opacity-80">
                     留空则继续使用内置系统默认 AI (仅限 Gemini)。若您选择了 DeepSeek 请务必填入对应的 API Key。您的秘钥将仅安全保存在浏览器本地 localStorage 中。
                   </p>
                 </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 text-xs bg-transparent border border-[var(--color-glass-border)] text-[var(--color-text-primary)] rounded hover:bg-white/5 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={saveSettings}
                  className="px-4 py-2 text-xs bg-[var(--color-accent-gold)] text-black font-bold rounded hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCheck className="w-4 h-4" />
                  保存设定
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
