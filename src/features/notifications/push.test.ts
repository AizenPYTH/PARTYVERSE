import { pushDestination } from './push';

describe('push destinations', () => {
  it('accepts in-app paths only', () => {
    expect(pushDestination({ url: '/messages/2f1c6f0e-6d7a-4c1b-9d55-3a4b5c6d7e8f' })).toBe('/messages/2f1c6f0e-6d7a-4c1b-9d55-3a4b5c6d7e8f');
    expect(pushDestination({ url: '/quests' })).toBe('/quests');
    expect(pushDestination({ url: 'https://evil.example/phish' })).toBeNull();
    expect(pushDestination({})).toBeNull();
    expect(pushDestination(null)).toBeNull();
  });
});
