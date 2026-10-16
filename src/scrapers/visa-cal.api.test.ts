import { fetchCalApi } from './visa-cal';

const FRAMES_URL = 'https://api.cal-online.co.il/Frames/api/Frames/GetFrameStatus';

const pageResponding = (text: string, status: number) => ({ evaluate: jest.fn().mockResolvedValue([text, status]) });
const pageFailing = (message: string) => ({ evaluate: jest.fn().mockRejectedValue(new Error(message)) });
const nodeResponse = (text: string, status: number) => ({ text: () => Promise.resolve(text), status }) as Response;

describe('fetchCalApi', () => {
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('unexpected node fetch'));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('sends the request from the page with credentials and JSON headers', async () => {
    const page = pageResponding('{"statusCode":1}', 200);
    await expect(fetchCalApi(page as any, FRAMES_URL, { x: 1 }, { Authorization: 'a' })).resolves.toEqual({
      statusCode: 1,
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    const [inPageFetch, ...inPageArgs] = page.evaluate.mock.calls[0];
    fetchSpy.mockResolvedValue(nodeResponse('{}', 200));
    await inPageFetch(...inPageArgs);
    expect(fetchSpy).toHaveBeenCalledWith(FRAMES_URL, {
      method: 'POST',
      body: '{"x":1}',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'a' },
    });
  });

  test('returns a JSON error body whatever its status, so callers keep handling its statusCode', async () => {
    const page = pageResponding('{"statusCode":3,"title":"error"}', 500);
    await expect(fetchCalApi(page as any, FRAMES_URL, {}, {})).resolves.toEqual({ statusCode: 3, title: 'error' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('throws an error naming the endpoint and status on a non-JSON response, without falling back', async () => {
    const page = pageResponding('<html>\n  Request Rejected\n</html>', 403);
    await expect(fetchCalApi(page as any, FRAMES_URL, {}, {})).rejects.toThrow(
      `Cal API request to ${FRAMES_URL} returned a non-JSON response (status 403): <html> Request Rejected </html>`,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("falls back to node with Cal's web app headers when the page cannot send the request", async () => {
    fetchSpy.mockResolvedValue(nodeResponse('{"statusCode":1}', 200));
    const page = pageFailing('Execution context was destroyed, most likely because of a navigation');
    await expect(fetchCalApi(page as any, FRAMES_URL, { x: 1 }, { Authorization: 'a' })).resolves.toEqual({
      statusCode: 1,
    });
    expect(fetchSpy).toHaveBeenCalledWith(FRAMES_URL, {
      method: 'POST',
      body: '{"x":1}',
      headers: expect.objectContaining({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://digital-web.cal-online.co.il',
        Referer: 'https://digital-web.cal-online.co.il',
        Authorization: 'a',
      }),
    });
  });

  test('names the endpoint and both failures when the node fallback fails too', async () => {
    fetchSpy.mockResolvedValue(nodeResponse('<html>Request Rejected</html>', 403));
    await expect(fetchCalApi(pageFailing('Failed to fetch') as any, FRAMES_URL, {}, {})).rejects.toThrow(
      `Cal API request to ${FRAMES_URL} failed in the browser: Failed to fetch; node fallback also failed: ` +
        `Cal API request to ${FRAMES_URL} returned a non-JSON response (status 403): <html>Request Rejected</html>`,
    );
  });
});
