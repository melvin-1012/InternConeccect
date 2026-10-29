const { Builder, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { expect } = require('chai');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

describe('InternConnect - Selenium Additional Query & Boundary E2E', function() {
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

  it('should return 404 for non-existent opportunity id', async () => {
    await driver.get(BASE_URL + '/healthz');
    const result = await driver.executeScript(async (url) => {
      try {
        const res = await fetch(url + '/api/opportunities/nonexistent_id');
        return { status: res.status };
      } catch (e) {
        return { error: e.message };
      }
    }, BASE_URL);
    expect(result.status).to.equal(404);
  });

  it('should validate pagination parameters work correctly', async () => {
    await driver.get(BASE_URL + '/healthz');
    const result = await driver.executeScript(async (url) => {
      try {
        const res = await fetch(url + '/api/opportunities?page=1&pageSize=2');
        const data = await res.json();
        return { status: res.status, items: data.items.length, page: data.page, pageSize: data.pageSize };
      } catch (e) {
        return { error: e.message };
      }
    }, BASE_URL);
    expect(result.status).to.equal(200);
    expect(result.pageSize).to.equal(2);
    expect(result.items).to.be.at.most(2);
  });

  it('should return all opportunities when no filter applied', async () => {
    await driver.get(BASE_URL + '/healthz');
    const result = await driver.executeScript(async (url) => {
      try {
        const res = await fetch(url + '/api/opportunities');
        const data = await res.json();
        return { status: res.status, total: data.total, items: data.items.length };
      } catch (e) {
        return { error: e.message };
      }
    }, BASE_URL);
    expect(result.status).to.equal(200);
    expect(result.total).to.be.greaterThan(0);
    expect(result.items).to.be.greaterThan(0);
  });

  it('should filter by remote work mode', async () => {
    await driver.get(BASE_URL + '/healthz');
    const result = await driver.executeScript(async (url) => {
      try {
        const res = await fetch(url + '/api/opportunities?mode=remote');
        const data = await res.json();
        return { status: res.status, items: data.items };
      } catch (e) {
        return { error: e.message };
      }
    }, BASE_URL);
    expect(result.status).to.equal(200);
    result.items.forEach(item => {
      expect(item.mode).to.equal('remote');
    });
  });
});
