import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';
import Icon from './Icon';

export default function ScreenshotImport({
  subject,
  busy,
  onRecognize,
}: {
  subject: string;
  busy: boolean;
  onRecognize: (file: File) => Promise<unknown>;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const locked = busy || running;
  useEffect(() => {
    if (!selected) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(selected);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selected]);
  function choose(file?: File) {
    if (!file || locked) return;
    if (!/\.(png|jpe?g|webp)$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024) {
      setError('请选择 PNG、JPEG 或 WEBP 图片，文件须非空且不超过 10 MB。');
      return;
    }
    setError('');
    setSelected(file);
  }
  return (
    <section
      className={`screenshot-import ${selected ? 'has-preview' : ''}`}
      aria-label={`${subject}截图导入`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        choose(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={picker}
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.webp"
        aria-label={`选择${subject}截图`}
        disabled={locked}
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="screenshot-import-heading">
        <div>
          <h3>从截图导入</h3>
          <p>先预览图片，再识别内容</p>
        </div>
        <Button tone="secondary" disabled={locked} onClick={() => picker.current?.click()}>
          <Icon name="upload" />
          {selected ? '更换图片' : '选择图片'}
        </Button>
      </div>
      {selected && (
        <>
          <div className="screenshot-preview">
            {preview && <img src={preview} alt={`${subject}截图预览`} />}
          </div>
          <div className="screenshot-import-footer">
            <span className="screenshot-filename" title={selected.name}>
              {selected.name}
            </span>
            <div className="inline-actions">
              <Button tone="ghost" disabled={locked} onClick={() => setSelected(null)}>
                移除
              </Button>
              <Button
                tone="primary"
                disabled={locked}
                onClick={async () => {
                  if (locked) return;
                  setRunning(true);
                  try {
                    await onRecognize(selected);
                  } finally {
                    setRunning(false);
                  }
                }}
              >
                {running ? '正在识别…' : '识别截图'}
              </Button>
            </div>
          </div>
          <p className="screenshot-hint">点击识别才会发送图片至所选模型，结果可编辑后保存。</p>
        </>
      )}
      {!selected && (
        <p className="screenshot-hint">也可拖入图片 · PNG / JPEG / WEBP · 最大 10 MB</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
