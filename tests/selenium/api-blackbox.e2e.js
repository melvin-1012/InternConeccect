const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { expect } = require('chai');

describe('InternConnect - Black Box API Tests (via Selenium)', function() {
  this.timeout(60000);
  let driver;

  before(async () => {
    const options = new chrome.Options();
    driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  });

  after(async () => {
    if (driver) await driver.quit();
  });

  const BASE_URL = 'http://localhost:5000';

  it('should check health endpoint via fetch', async () => {
    await driver.get(BASE_URL + '/healthz');
    const result = await driver.executeScript(async () => {
      try {
        const res = await fetch('/healthz');
        const data = await res.json();
        return { status: res.status, data };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.status).to.equal(200);
    expect(result.data.status).to.equal('ok');
  });

  it('should check public stats endpoint via fetch', async () => {
    await driver.get(BASE_URL + '/api/public/stats');
    const result = await driver.executeScript(async () => {
      try {
        const res = await fetch('/api/public/stats');
        const data = await res.json();
        return { status: res.status, data };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.status).to.equal(200);
    expect(result.data).to.have.property('students');
    expect(result.data).to.have.property('companies');
    expect(result.data).to.have.property('placements');
    expect(result.data).to.have.property('internships');
  });
});
