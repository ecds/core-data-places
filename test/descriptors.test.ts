import { toLabels } from '@services/descriptors';
import { describe, expect, test } from 'vitest';

describe('toLabels', () => {
  test('keys relationship, inverse and field labels the way buildTranslations expects', () => {
    const labels = toLabels([
      { identifier: '2eb45b9c-087a-4dfc-a7f6-16d6598fb8f4', label: 'Places' },
      { identifier: 'f22b99a4-0746-429c-8d17-92399f329eef', label: 'Contained In', context: 'Places', inverse_label: 'Contains' },
      { identifier: '1c2e1456-c521-4951-8626-ec6847e4b49d', label: 'Denomination', context: 'Places' },
      { identifier: '', label: 'ignored' }
    ]);

    expect(labels).toEqual({
      t_2eb45b9c087a4dfca7f616d6598fb8f4: 'Places',
      t_f22b99a40746429c8d1792399f329eef: 'Contained In',
      t_f22b99a40746429c8d1792399f329eef_inverse: 'Contains',
      t_1c2e1456c52149518626ec6847e4b49d: 'Denomination'
    });
  });
});
