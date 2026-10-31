import { TestBed } from '@angular/core/testing';
import { Dog, Widget } from './widget';

const DOG: Dog = {
  imageUrl: 'https://images.dog.ceo/breeds/hound-afghan/n02088094_1003.jpg',
  breed: 'Hound (afghan)',
  caption: 'Dzisiejszy patron spokojnych poranków',
};

describe('Widget', () => {
  async function render(response: Response) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    const fixture = TestBed.createComponent(Widget);
    await fixture.whenStable();
    return { el: fixture.nativeElement as HTMLElement, fetchMock };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('fetches the dog of the day from the API', async () => {
    const { fetchMock } = await render(Response.json(DOG));
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/api/dog');
  });

  it('renders photo, breed and caption', async () => {
    const { el } = await render(Response.json(DOG));
    const img = el.querySelector('img');

    expect(img?.getAttribute('src')).toBe(DOG.imageUrl);
    expect(img?.getAttribute('alt')).toBe('Pies dnia: Hound (afghan)');
    expect(el.querySelector('.breed')?.textContent).toBe('Hound (afghan)');
    expect(el.querySelector('.caption')?.textContent).toBe(DOG.caption);
  });

  it('shows a skeleton before data arrives', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const fixture = TestBed.createComponent(Widget);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.skeleton')).not.toBeNull();
  });

  it('shows a friendly message when the API fails', async () => {
    const { el } = await render(new Response(null, { status: 502 }));
    expect(el.querySelector('.error')?.textContent).toContain('Pies dnia poszedł na spacer');
  });
});
