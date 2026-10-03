import { describe, expect, it } from 'vitest';
import { getEmbed, getEmbedField, toEmbed } from '../src/utils/embeds';

describe('embeds', () => {
  it('embeds 360° views and tours from known hosts', () => {
    expect(toEmbed('https://kuula.co/share/collection/7lVLq?logo=1')).toMatchObject({ src: 'https://kuula.co/share/collection/7lVLq?logo=1', kind: 'panorama', provider: 'Kuula' });
    expect(toEmbed('https://momento360.com/e/u/abc-123?utm_campaign=embed')).toMatchObject({ kind: 'panorama', provider: 'Momento360' });
    expect(toEmbed('https://roundme.com/tour/123456/view/7890123')?.src).toBe('https://roundme.com/embed/123456/7890123');
    expect(toEmbed('https://my.matterport.com/show/?m=SxQL3iGyoDo')?.src).toBe('https://my.matterport.com/show/?m=SxQL3iGyoDo');
    expect(toEmbed('https://panoee.com/oVuyJ8nkT9')?.kind).toBe('tour');
  });

  it('turns video links into their players', () => {
    expect(toEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')?.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(toEmbed('https://youtu.be/dQw4w9WgXcQ')?.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(toEmbed('https://vimeo.com/76979871')?.src).toBe('https://player.vimeo.com/video/76979871');
    expect(toEmbed('https://www.google.com/maps/embed?pb=!1m18!1m12')?.kind).toBe('map');
  });

  it('frames nothing else', () => {
    expect(toEmbed('http://kuula.co/share/7lVLq')).toBeNull();
    expect(toEmbed('https://evil.example/share/x')).toBeNull();
    expect(toEmbed('https://kuula.co.evil.example/share/x')).toBeNull();
    expect(toEmbed('https://user:pass@kuula.co/share/x')).toBeNull();
    expect(toEmbed('https://kuula.co:8443/share/x')).toBeNull();
    expect(toEmbed('javascript:alert(1)')).toBeNull();
    expect(toEmbed('https://www.youtube.com/watch?v=<script>')).toBeNull();
    expect(toEmbed('https://www.google.com/maps/@32.08,-81.09,15z')).toBeNull();
    expect(toEmbed('')).toBeNull();
  });

  it('reads the field the atlas names', () => {
    const record = { user_defined: { u1: { label: '360 view', type: 'String', value: ' https://kuula.co/share/7lVLq ' } } };
    expect(getEmbedField({ detail_pages: { models: { places: { embed_field: '360_view' } } } }, 'places')).toBe('360_view');
    expect(getEmbed(record, '360_view')?.provider).toBe('Kuula');
    expect(getEmbed(record, '360 view')?.provider).toBe('Kuula');
    expect(getEmbed(record, 'u1')?.provider).toBe('Kuula');
    expect(getEmbed(record, null)).toBeNull();
  });
});
