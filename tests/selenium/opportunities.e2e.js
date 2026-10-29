const { Builder, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { expect } = require('chai');

const BASE_URL = 'http://localhost:5000';

describe('InternConnect UI - Selenium E2E (Mock API)', function() {
  this.timeout(60000);
  let driver;

  before(async () => {
    const options = new chrome.Options();
    driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  });

  after(async () => {
    if (driver) await driver.quit();
  });

  it('should fetch opportunities list from API', async () => {
    await driver.get(BASE_URL + '/api/opportunities');
    const result = await driver.executeScript(async () => {
      try {
        const res = await fetch('/api/opportunities');
        const data = await res.json();
        return { status: res.status, data };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.status).to.equal(200);
    expect(Array.isArray(result.data.items)).to.be.true;
    expect(result.data).to.have.property('total');
    expect(result.data).to.have.property('page');
    expect(result.data).to.have.property('pageSize');
  });

  it('should filter opportunities by type=internship', async () => {
    await driver.get(BASE_URL + '/api/opportunities?type=internship');
    const result = await driver.executeScript(async () => {
      try {
        const res = await fetch('/api/opportunities?type=internship');
        const data = await res.json();
        return { status: res.status, data };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.status).to.equal(200);
    if (result.data.items.length > 0) {
      result.data.items.forEach(item => {
        expect(item.type).to.equal('internship');
      });
    }
  });

  it('should fetch single opportunity by id', async () => {
    await driver.get(BASE_URL + '/api/opportunities/opp_1');
    const result = await driver.executeScript(async () => {
      try {
        const res = await fetch('/api/opportunities/opp_1');
        const data = await res.json();
        return { status: res.status, data };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.status).to.equal(200);
    expect(result.data).to.have.property('id');
    expect(result.data).to.have.property('title');
    expect(result.data).to.have.property('company');
  });
});
