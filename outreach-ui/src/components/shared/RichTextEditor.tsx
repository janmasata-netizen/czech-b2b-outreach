import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon,
  List, ListOrdered, Undo2, Redo2,
} from 'lucide-react';
import GlassModal from '@/components/glass/GlassModal';
import GlassButton from '@/components/glass/GlassButton';
import GlassInput from '@/components/glass/GlassInput';
import type { TemplateVariable } from '@/types/database';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  variables?: TemplateVariable[];
  placeholder?: string;
  minHeight?: number;
}

export interface RichTextEditorRef {
  insertVariable: (varName: string) => void;
}

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ value, onChange, variables, placeholder, minHeight = 250 }, ref) => {
    const internalUpdate = useRef(false);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          code: false,
          blockquote: false,
          horizontalRule: false,
        }),
        Underline,
        Link.configure({ openOnClick: false }),
        Placeholder.configure({ placeholder: placeholder ?? '' }),
      ],
      content: value,
      onUpdate: ({ editor: ed }) => {
        internalUpdate.current = true;
        onChange(ed.getHTML());
      },
    });

    // Sync external value changes into editor
    useEffect(() => {
      if (!editor) return;
      if (internalUpdate.current) {
        internalUpdate.current = false;
        return;
      }
      const current = editor.getHTML();
      if (value !== current) {
        editor.commands.setContent(value, { emitUpdate: false });
      }
    }, [value, editor]);

    useImperativeHandle(ref, () => ({
      insertVariable(varName: string) {
        if (!editor) return;
        editor.chain().focus().insertContent(`{{${varName}}}`).run();
      },
    }));

    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');

    if (!editor) return null;

    function handleLink() {
      if (!editor) return;
      if (editor.isActive('link')) {
        editor.chain().focus().unsetLink().run();
        return;
      }
      setLinkUrl('');
      setLinkModalOpen(true);
    }

    function applyLink() {
      if (!editor || !linkUrl.trim()) return;
      const url = linkUrl.trim().startsWith('http') ? linkUrl.trim() : `https://${linkUrl.trim()}`;
      editor.chain().focus().setLink({ href: url }).run();
      setLinkModalOpen(false);
      setLinkUrl('');
    }

    return (
      <div className="tiptap-editor" style={{ minHeight }}>
        {/* Formatting toolbar */}
        <div className="tiptap-toolbar">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'is-active' : ''}
            title="Tučné"
          ><Bold size={15} /></button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'is-active' : ''}
            title="Kurzíva"
          ><Italic size={15} /></button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? 'is-active' : ''}
            title="Podtržené"
          ><UnderlineIcon size={15} /></button>

          <button
            type="button"
            onClick={handleLink}
            className={editor.isActive('link') ? 'is-active' : ''}
            title="Odkaz"
          ><LinkIcon size={15} /></button>

          <div className="separator" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive('bulletList') ? 'is-active' : ''}
            title="Odrážky"
          ><List size={15} /></button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive('orderedList') ? 'is-active' : ''}
            title="Číslovaný seznam"
          ><ListOrdered size={15} /></button>

          <div className="separator" />

          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Zpět"
          ><Undo2 size={15} /></button>

          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Vpřed"
          ><Redo2 size={15} /></button>
        </div>

        {/* Variable insertion buttons */}
        {variables && variables.length > 0 && (
          <div className="tiptap-variables">
            <span className="var-label">Vložit:</span>
            {variables.map(v => (
              <button
                key={v.name}
                type="button"
                onClick={() => editor.chain().focus().insertContent(`{{${v.name}}}`).run()}
              >{`{{${v.name}}}`}</button>
            ))}
          </div>
        )}

        {/* Editor content */}
        <EditorContent editor={editor} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} />

        <GlassModal
          open={linkModalOpen}
          onClose={() => setLinkModalOpen(false)}
          title="Vložit odkaz"
          width={400}
          footer={
            <>
              <GlassButton variant="secondary" onClick={() => setLinkModalOpen(false)}>Zrušit</GlassButton>
              <GlassButton variant="primary" onClick={applyLink} disabled={!linkUrl.trim()}>Vložit</GlassButton>
            </>
          }
        >
          <GlassInput
            label="URL odkazu"
            placeholder="https://www.example.com"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyLink(); }}
            autoFocus
          />
        </GlassModal>
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';
export default RichTextEditor;
