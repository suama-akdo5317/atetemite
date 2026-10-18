import { describe, expect, it } from 'vitest';
import { buildPrompt } from './prompt';
import { parseArgs } from './run';

describe('parseArgs', () => {
  it('parses a single category with defaults', () => {
    expect(parseArgs(['--category', 'animals'])).toEqual({
      category: 'animals',
      all: false,
      count: 30,
      dryRun: false,
    });
  });

  it('parses --all, --count and --dry-run', () => {
    expect(parseArgs(['--all', '--count', '10', '--dry-run'])).toEqual({
      category: undefined,
      all: true,
      count: 10,
      dryRun: true,
    });
  });

  it.each([
    [[]], // どちらもない
    [['--all', '--category', 'animals']], // 両方ある
    [['--all', '--count', '0']],
    [['--all', '--count', '101']],
    [['--all', '--count', 'abc']],
    [['--all', '--unknown']],
  ])('rejects %j', (argv) => {
    expect(() => parseArgs(argv)).toThrow();
  });
});

describe('buildPrompt', () => {
  it('includes the category, count and existing topics as data', () => {
    const prompt = buildPrompt('動物', ['キリン', 'ゾウ'], 5);
    expect(prompt).toContain('<category>動物</category>');
    expect(prompt).toContain('5');
    expect(prompt).toContain('キリン\nゾウ');
  });

  it('omits the existing block when there are none', () => {
    expect(buildPrompt('動物', [], 5)).not.toContain('<existing_topics>');
  });
});
