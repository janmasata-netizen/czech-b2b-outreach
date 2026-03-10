import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GlassInput from './GlassInput';

describe('GlassInput', () => {
  it('renders with label', () => {
    render(<GlassInput label="E-mail" />);
    expect(screen.getByText('E-mail')).toBeInTheDocument();
  });

  it('renders without label', () => {
    const { container } = render(<GlassInput placeholder="test" />);
    expect(container.querySelector('label')).toBeNull();
  });

  it('shows error message', () => {
    render(<GlassInput error="Required field" />);
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('forwards placeholder prop', () => {
    render(<GlassInput placeholder="Enter email" />);
    expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
  });

  it('fires onChange', () => {
    const onChange = vi.fn();
    render(<GlassInput onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('applies glass-input class', () => {
    render(<GlassInput placeholder="test" />);
    const input = screen.getByPlaceholderText('test');
    expect(input.className).toContain('glass-input');
  });
});
