import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GlassButton from './GlassButton';

describe('GlassButton', () => {
  it('renders children text', () => {
    render(<GlassButton>Click me</GlassButton>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('applies primary variant class', () => {
    render(<GlassButton variant="primary">Primary</GlassButton>);
    const btn = screen.getByText('Primary');
    expect(btn.className).toContain('glass-btn-primary');
  });

  it('applies secondary variant class by default', () => {
    render(<GlassButton>Default</GlassButton>);
    const btn = screen.getByText('Default');
    expect(btn.className).toContain('glass-btn-secondary');
  });

  it('applies danger variant class', () => {
    render(<GlassButton variant="danger">Delete</GlassButton>);
    const btn = screen.getByText('Delete');
    expect(btn.className).toContain('glass-btn-danger');
  });

  it('handles click events', () => {
    const onClick = vi.fn();
    render(<GlassButton onClick={onClick}>Click</GlassButton>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('respects disabled state', () => {
    const onClick = vi.fn();
    render(<GlassButton disabled onClick={onClick}>Disabled</GlassButton>);
    const btn = screen.getByText('Disabled');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies size styles', () => {
    render(<GlassButton size="sm">Small</GlassButton>);
    const btn = screen.getByText('Small');
    expect(btn.style.fontSize).toBe('12px');
  });
});
