const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { expect } = require('chai');

describe('InternConnect - Black Box API Tests (via Headless Chrome)', function() {
  this.timeout(60000);
  let driver;

  before(async () => {
    const options = new chrome.Options();
    options.addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu');
    driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  });

  after(async () => {
    if (driver) await driver.quit();
  });

  const BASE_URL = process.env.API_URL || 'http://localhost:5000';

  it('should check health endpoint via fetch in browser context', async () => {
    await driver.get(BASE_URL + '/healthz');
    const result = await driver.executeScript(async (url) => {
      try {
        const res = await fetch(url + '/healthz');
        const data = await res.json();
        return { status: res.status, data };
      } catch (e) {
        return { error: e.message };
      }
    }, BASE_URL);
    expect(result.status).to.equal(200);
    expect(result.data.status).to.equal('ok');
  });

  it('should check public stats endpoint via browser fetch', async () => {
    await driver.get(BASE_URL + '/healthz');
    const result = await driver.executeScript(async (url) => {
      try {
        const res = await fetch(url + '/api/public/stats');
        const data = await res.json();
        return { status: res.status, data };
      } catch (e) {
        return { error: e.message };
      }
    }, BASE_URL);
    expect(result.status).to.equal(200);
    expect(result.data).to.have.property('students');
    expect(result.data).to.have.property('companies');
    expect(result.data).to.have.property('placements');
    expect(result.data).to.have.property('internships');
  });

  it('should check opportunities endpoint returns valid paginated list', async () => {
    await driver.get(BASE_URL + '/healthz');
    const result = await driver.executeScript(async (url) => {
      try {
        const res = await fetch(url + '/api/opportunities?page=1&pageSize=3');
        const data = await res.json();
        return { status: res.status, data };
      } catch (e) {
        return { error: e.message };
      }
    }, BASE_URL);
    expect(result.status).to.equal(200);
    expect(Array.isArray(result.data.items)).to.be.true;
    expect(result.data.items.length).to.be.at.most(3);
  });
});
