import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GlassModal from './GlassModal';

// Mock useMobile hook
vi.mock('@/hooks/useMobile', () => ({
  default: () => false,
}));

describe('GlassModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <GlassModal open={false} onClose={() => {}} title="Test">
        Content
      </GlassModal>
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders content when open', () => {
    render(
      <GlassModal open={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </GlassModal>
    );
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <GlassModal open={true} onClose={onClose} title="Test">
        Content
      </GlassModal>
    );
    // Click the backdrop (outermost div with class glass-modal-backdrop)
    const backdrop = document.querySelector('.glass-modal-backdrop');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <GlassModal open={true} onClose={onClose} title="Test">
        Content
      </GlassModal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose when content is clicked', () => {
    const onClose = vi.fn();
    render(
      <GlassModal open={true} onClose={onClose} title="Test">
        <p>Click me</p>
      </GlassModal>
    );
    fireEvent.click(screen.getByText('Click me'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders footer when provided', () => {
    render(
      <GlassModal open={true} onClose={() => {}} title="Test" footer={<button>Save</button>}>
        Content
      </GlassModal>
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <GlassModal open={true} onClose={onClose} title="Test">
        Content
      </GlassModal>
    );
    // The close button contains the × character
    const closeBtn = screen.getByText('×');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
