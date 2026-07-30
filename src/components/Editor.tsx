import './Editor.css'

interface EditorProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Plain-text editor pane for writing Fountain screenplay source.
 *
 * Deliberately a bare textarea for now — no syntax highlighting or persistence.
 * Upload / paste / download will be layered on later.
 */
export function Editor({ value, onChange }: EditorProps) {
  return (
    <div className="editor">
      <div className="editor__header">Fountain</div>
      <textarea
        className="editor__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="Write your screenplay in Fountain syntax…"
        autoFocus
      />
    </div>
  )
}
