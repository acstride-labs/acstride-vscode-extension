import React, { useEffect, useState } from 'react';
import {
  defaultTranslationOptions,
  defaultTranslationPrompt,
  type TranslationOptions,
} from '../../../src/shared/ai-protocol';
import { send } from '../bridge';
export function TranslationSettingsCard({ options }: { options?: TranslationOptions }) {
  const [draft, setDraft] = useState(defaultTranslationOptions);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (options) {
      setDraft(options);
      setSaved(true);
    }
  }, [options?.enabled, options?.autoTranslate, options?.prompt]);
  const change = (value: Partial<TranslationOptions>) => {
    setDraft({ ...draft, ...value });
    setSaved(false);
  };
  return (
    <section className="card settings-section">
      <h2>AI 题面翻译</h2>
      <label>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => change({ enabled: e.target.checked })}
        />
        开启 AI 题面翻译
      </label>
      <label>
        <input
          type="checkbox"
          disabled={!draft.enabled}
          checked={draft.autoTranslate}
          onChange={(e) => change({ autoTranslate: e.target.checked })}
        />
        导入时自动翻译
      </label>
      <p>
        使用“环境检测”中的 AI
        配置。开启自动翻译后，下载完成的题面会发送给所配置的模型；否则点击题面的翻译图标时开始翻译。
      </p>
      <label>
        翻译 Prompt
        <textarea
          rows={8}
          value={draft.prompt}
          maxLength={20000}
          onChange={(e) => change({ prompt: e.target.value })}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={!draft.prompt.trim() || saved}
          onClick={() => send({ type: 'saveTranslationSettings', options: draft })}
        >
          保存
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => change({ prompt: defaultTranslationPrompt })}
        >
          恢复默认 Prompt
        </button>
        {saved && <span role="status">已保存</span>}
      </div>
    </section>
  );
}
