// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../game/constants';
import { Lobby } from '../app/components/Lobby';

afterEach(cleanup);

describe('lobby obstacle behavior option', () => {
  it.each(['static', 'movable', 'destroyable'] as const)('selects %s', (obstacleBehavior) => {
    const onConfigure = vi.fn();
    const label = obstacleBehavior[0]!.toUpperCase() + obstacleBehavior.slice(1);
    render(
      <Lobby
        members={[]}
        mapId="classic"
        seed={1}
        options={DEFAULT_OPTIONS}
        joinUrls={[]}
        onConfigure={onConfigure}
        onStart={() => undefined}
        notice={null}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: label }));

    expect(onConfigure).toHaveBeenCalledWith('classic', 1, {
      ...DEFAULT_OPTIONS,
      obstacleBehavior,
    });
  });
});
