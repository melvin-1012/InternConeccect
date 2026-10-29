const { Builder, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { expect } = require('chai');

const BASE_URL = 'http://localhost:5000';

describe('InternConnect UI - Selenium Additional E2E', function() {
  this.timeout(60000);
  let driver;

  before(async () => {
    const options = new chrome.Options();
    driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  });

  after(async () => {
    if (driver) await driver.quit();
  });

  it('should return 404 for non-existent opportunity id', async () => {
    await driver.get(BASE_URL + '/api/opportunities/nonexistent_id');
    const result = await driver.executeScript(async () => {
      try {
        const res = await fetch('/api/opportunities/nonexistent_id');
        return { status: res.status };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.status).to.equal(404);
  });

  it('should validate pagination parameters work correctly', async () => {
    await driver.get(BASE_URL + '/api/opportunities?page=1&pageSize=2');
    const result = await driver.executeScript(async () => {
      try {
        const res = await fetch('/api/opportunities?page=1&pageSize=2');
        const data = await res.json();
        return { status: res.status, items: data.items.length, page: data.page, pageSize: data.pageSize };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.status).to.equal(200);
    expect(result.pageSize).to.equal(2);
    expect(result.items).to.be.at.most(2);
  });

  it('should return all opportunities when no filter applied', async () => {
    await driver.get(BASE_URL + '/api/opportunities');
    const result = await driver.executeScript(async () => {
      try {
        const res = await fetch('/api/opportunities');
        const data = await res.json();
        return { status: res.status, total: data.total, items: data.items.length };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.status).to.equal(200);
    expect(result.total).to.be.greaterThan(0);
    expect(result.items).to.be.greaterThan(0);
  });

  it('should filter by remote work mode', async () => {
    await driver.get(BASE_URL + '/api/opportunities?mode=remote');
    const result = await driver.executeScript(async () => {
      try {
        const res = await fetch('/api/opportunities?mode=remote');
        const data = await res.json();
        return { status: res.status, items: data.items };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.status).to.equal(200);
    result.items.forEach(item => {
      expect(item.mode).to.equal('remote');
    });
  });
});
