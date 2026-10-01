import { SCRAPERS } from '../definitions';
import { exportTransactions, extendAsyncTimeout, getTestsConfig, maybeTestCompanyAPI } from '../tests/tests-utils';
import { LoginResults } from './base-scraper-with-browser';
import VisaCalScraper, { fetchCalApi } from './visa-cal';

const COMPANY_ID = 'visaCal'; // TODO this property should be hard-coded in the provider
const testsConfig = getTestsConfig();

describe('VisaCal legacy scraper', () => {
  beforeAll(() => {
    extendAsyncTimeout(); // The default timeout is 5 seconds per async test, this function extends the timeout value
  });

  test('should expose login fields in scrapers constant', () => {
    expect(SCRAPERS.visaCal).toBeDefined();
    expect(SCRAPERS.visaCal.loginFields).toContain('username');
    expect(SCRAPERS.visaCal.loginFields).toContain('password');
  });

  maybeTestCompanyAPI(COMPANY_ID, config => config.companyAPI.invalidPassword)(
    'should fail on invalid user/password"',
    async () => {
      const options = {
        ...testsConfig.options,
        companyId: COMPANY_ID,
      };

      const scraper = new VisaCalScraper(options);

      const result = await scraper.scrape({ username: '971sddksmsl', password: '3f3ssdkSD3d' });

      expect(result).toBeDefined();
      expect(result.success).toBeFalsy();
      expect(result.errorType).toBe(LoginResults.InvalidPassword);
    },
  );

  maybeTestCompanyAPI(COMPANY_ID)('should scrape transactions"', async () => {
    const options = {
      ...testsConfig.options,
      companyId: COMPANY_ID,
    };

    const scraper = new VisaCalScraper(options);
    const result = await scraper.scrape(testsConfig.credentials.visaCal);
    expect(result).toBeDefined();
    const error = `${result.errorType || ''} ${result.errorMessage || ''}`.trim();
    expect(error).toBe('');
    expect(result.success).toBeTruthy();
    // uncomment to test multiple accounts
    // expect(result?.accounts?.length).toEqual(2)
    exportTransactions(COMPANY_ID, result.accounts || []);
  });
});

describe('fetchCalApi', () => {
  const URL = 'https://api.cal-online.co.il/Frames/api/Frames/GetFrameStatus';
  const mockPage = (result: [string, number]) => ({ evaluate: jest.fn().mockResolvedValue(result) }) as any;

  test('parses a JSON success response and passes request details into the page', async () => {
    const page = mockPage(['{"statusCode":1,"result":{"a":2}}', 200]);
    const result = await fetchCalApi(page, URL, { x: 1 }, { Authorization: 'CALAuthScheme t', 'X-Site-Id': 's' });
    expect(result).toEqual({ statusCode: 1, result: { a: 2 } });
    expect(page.evaluate).toHaveBeenCalledWith(
      expect.any(Function),
      URL,
      { x: 1 },
      expect.objectContaining({ 'X-Site-Id': 's' }),
    );
  });

  test('throws a clear error naming endpoint and status on an HTML block page', async () => {
    const page = mockPage(['<html><head>Request Rejected</head></html>', 200]);
    const promise = fetchCalApi(page, URL, {}, {});
    await expect(promise).rejects.toThrow(/non-JSON response/);
    await expect(promise).rejects.toThrow(URL);
    await expect(promise).rejects.toThrow(/status 200/);
    await expect(promise).rejects.not.toThrow(/Unexpected token/);
  });

  test('throws a clear error on a non-2xx status', async () => {
    const page = mockPage(['<html>Request Rejected</html>', 400]);
    await expect(fetchCalApi(page, URL, {}, {})).rejects.toThrow(`${URL} failed with status 400`);
  });

  test('names the endpoint when the in-page fetch rejects', async () => {
    const page = { evaluate: jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) } as any;
    await expect(fetchCalApi(page, `${URL}?a=1`, {}, {})).rejects.toThrow(
      `Cal API request to ${URL} failed in the browser: Failed to fetch`,
    );
  });
});
