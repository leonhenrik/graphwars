// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Calculator } from '../app/components/Calculator';

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState('sin(x)');
  return (
    <Calculator
      value={value}
      onChange={setValue}
      error={null}
      onFire={() => undefined}
      onToggleDirection={() => undefined}
      direction={1}
      canFire
      disabled={false}
      fireLabel="Fire"
    />
  );
}

describe('calculator cursor buttons', () => {
  it('move the cursor back and forward, so keys insert in the middle', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/y = f\(x\)/) as HTMLInputElement;
    input.setSelectionRange(6, 6);

    fireEvent.click(screen.getByTestId('cursor-back'));
    fireEvent.click(screen.getByTestId('cursor-back'));
    expect(input.selectionStart).toBe(4);
    fireEvent.click(screen.getByText('7'));
    expect(input.value).toBe('sin(7x)');
    expect(input.selectionStart).toBe(5);

    fireEvent.click(screen.getByTestId('cursor-forward'));
    expect(input.selectionStart).toBe(6);
  });

  it('stop at both ends of the text', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/y = f\(x\)/) as HTMLInputElement;
    input.setSelectionRange(0, 0);
    fireEvent.click(screen.getByTestId('cursor-back'));
    expect(input.selectionStart).toBe(0);
    input.setSelectionRange(6, 6);
    fireEvent.click(screen.getByTestId('cursor-forward'));
    expect(input.selectionStart).toBe(6);
  });
});
