import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RemoteWidget } from './remote-widget';
import { LOAD_REMOTE } from './remotes';

@Component({ selector: 'app-fake-widget', template: '<p class="fake">Widget z remote</p>' })
class FakeWidget {}

describe('RemoteWidget', () => {
  function setup(loadRemote: (name: string) => Promise<unknown>) {
    TestBed.configureTestingModule({
      imports: [RemoteWidget],
      providers: [{ provide: LOAD_REMOTE, useValue: loadRemote }],
    });
    const fixture = TestBed.createComponent(RemoteWidget);
    fixture.componentRef.setInput('name', 'mfe-dog');
    return fixture;
  }

  it('asks the loader for the remote by name and renders its Widget', async () => {
    const loadRemote = vi.fn().mockResolvedValue({ Widget: FakeWidget });
    const fixture = setup(loadRemote);
    await fixture.whenStable();

    expect(loadRemote).toHaveBeenCalledWith('mfe-dog');
    expect(fixture.nativeElement.querySelector('.fake')?.textContent).toBe('Widget z remote');
  });

  it('shows a skeleton while the remote is loading', () => {
    const fixture = setup(() => new Promise(() => {}));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.skeleton')).not.toBeNull();
  });

  it('shows a fallback card when the remote is unavailable', async () => {
    const fixture = setup(() => Promise.reject(new Error('Remote is not initialized')));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Ten widget jest chwilowo niedostępny');
  });
});
