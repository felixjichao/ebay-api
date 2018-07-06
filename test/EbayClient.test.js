const assert = require("assert");
const moment = require("moment");
const mock = require("./Mock").create();
const _ = require("lodash");
const fs = require("fs");
const path = require("path");
const toJson = require("xml2json").toJson;

const EbayClient = require("../lib/EbayClient");
const errors = require("../lib/Error");
const OAuthClientData = {
  email: "testebay@wirelessbro.com",
  userId: "testebay00",
  token: "TOKENTOKENTOKEN",
  authType: "OAUTH",
  expire: "2018-07-01T01:31:34.148Z",
  env: "sandbox"
};

const AuthNAuthClientData = {
  email: "testebay@wirelessbro.com",
  userId: "testebay00",
  token: "TOKENTOKENTOKEN",
  authType: "AUTHNAUTH",
  expire: "2018-07-01T01:31:34.148Z",
  env: "sandbox",
  appConfig: {
    clientId: "CLIENTIDTEST",
    devId: "DEVIDTEST",
    certId: "CERTIDTEST"
  }
};

describe("EbayClient", () => {
  afterEach(() => mock.reset());

  it("EbayClient should save email, env, userId, token, authType, expire", () => {
    const ebayClient = new EbayClient(OAuthClientData);

    const keys = ["authType", "email", "env", "expire", "token", "userId"];
    assert.deepEqual(_.pick(ebayClient.config, keys), OAuthClientData);
  });

  it("throw NoAuthTokenError when no token provided", () => {
    let error = null;
    try {
      const ebayClient = new EbayClient(_.omit(OAuthClientData, ["token"]));
    } catch (err) {
      error = err;
    } finally {
      assert.equal(error.name, errors.NoAuthTokenError.name);
    }
  });

  it("throw InvalidAuthNAuthConfigError when the authType is AuthNAuth but no appConfig provided", () => {
    let error = null;
    try {
      const ebayClient = new EbayClient(
        _.omit(AuthNAuthClientData, ["appConfig"])
      );
    } catch (err) {
      error = err;
    } finally {
      assert.equal(error.name, errors.InvalidAuthNAuthConfigError.name);
    }
  });

  it("throw NotSupportedAuthTypeError when the authType is invalid", () => {
    let error = null;
    try {
      const ebayClient = new EbayClient({
        ...OAuthClientData,
        authType: "FAKE"
      });
    } catch (err) {
      error = err;
    } finally {
      assert.equal(error.name, errors.NotSupportedAuthTypeError.name);
    }
  });

  it("is expire determine expire correctly", () => {
    const ebayClient = new EbayClient(OAuthClientData);

    assert.equal(ebayClient.isExpire, true);
  });

  it("is expire determine not expire correctly", () => {
    const ebayClient = new EbayClient({
      ...OAuthClientData,
      expire: moment().add(1, "hour")
    });

    assert.equal(ebayClient.isExpire, false);
  });

  it("determine url according to the env", () => {
    const sandboxClient = new EbayClient({
      ...OAuthClientData,
      env: "sandbox"
    });

    const productionClient = new EbayClient({
      ...OAuthClientData,
      env: "production"
    });

    assert.equal(sandboxClient.url, "https://api.sandbox.ebay.com/ws/api.dll");
    assert.equal(productionClient.url, "https://api.ebay.com/ws/api.dll");
  });

  it("set OAuth headers correctly", () => {
    const ebayClient = new EbayClient(OAuthClientData);
    const expectedHeaders = {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1061",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-IAF-TOKEN": "Bearer " + OAuthClientData.token
    };
    assert.deepEqual(ebayClient.headers, expectedHeaders);
  });

  it("set AuthNAuth headers correctly", () => {
    const ebayClient = new EbayClient(AuthNAuthClientData);
    const expectedHeaders = {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1061",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-APP-NAME": AuthNAuthClientData.appConfig.clientId,
      "X-EBAY-API-DEV-NAME": AuthNAuthClientData.appConfig.devId,
      "X-EBAY-API-CERT-NAME": AuthNAuthClientData.appConfig.certId
    };
    assert.deepEqual(ebayClient.headers, expectedHeaders);
  });

  it("getSellerList is able to post correctly", () => {
    const ebayClient = new EbayClient(OAuthClientData);
    const expectedHeaders = {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1061",
      "X-EBAY-API-CALL-NAME": "GetSellerListRequest",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-IAF-TOKEN": "Bearer " + OAuthClientData.token
    };

    let postData = {};
    mock.onPost("https://api.sandbox.ebay.com/ws/api.dll").reply(postConfig => {
      postData = postConfig;
      return [200];
    });

    return ebayClient
      .getSellerList()
      .catch(() => {})
      .then(result => {
        assert(postData.data);
        assert.deepEqual(
          _.pick(postData.headers, Object.keys(expectedHeaders)),
          expectedHeaders
        );
      });
  });

  it("getSellerList throw InvalidOptionsError when pass an invalid options", () => {
    const ebayClient = new EbayClient(OAuthClientData);
    let caughtError;
    try {
      ebayClient.getSellerList("invalid");
    } catch (err) {
      caughtError = err;
    } finally {
      assert.equal(caughtError.name, errors.InvalidOptionsError.name);
    }
  });

  it("getSellerList is able to parse result correctly", () => {
    const ebayClient = new EbayClient(OAuthClientData);
    let postData;
    const sellerListSampleXML = fs
      .readFileSync(path.resolve(__dirname, "./getSellerListSample.xml"))
      .toString()
      .replace(/\n|\r/g, "");

    mock.onPost("https://api.sandbox.ebay.com/ws/api.dll").reply(postConfig => {
      postData = postConfig;
      return [200, sellerListSampleXML];
    });

    return ebayClient.getSellerList().then(result => {
      assert(result.GetSellerListResponse);
      assert(result.GetSellerListResponse.ItemArray.Item.length === 11);
    });
  });

  it("getSellerList is able to handle pagination correctly", () => {
    const ebayClient = new EbayClient(OAuthClientData);
    let postData;
    const pages = [1, 2, 3].map(number =>
      fs
        .readFileSync(
          path.resolve(
            __dirname,
            `./getSellerListSampleWithPagnination/${number}.xml`
          )
        )
        .toString()
    );

    mock.onPost("https://api.sandbox.ebay.com/ws/api.dll").reply(postConfig => {
      postData = postConfig;
      const pageInfo = /<PageNumber>(\d+)<\/PageNumber>/.exec(postConfig.data);
      if (pageInfo && pageInfo[1]) {
        return [200, pages[parseInt(pageInfo[1]) - 1]];
      }
      return [200, Page1];
    });

    return ebayClient.getSellerList().then(result => {
      assert.equal(result.GetSellerListResponse.ItemArray.Item.length, 11);
    });
  });

  it("getSellerOrder is able to post correctly", () => {
    const ebayClient = new EbayClient(OAuthClientData);
    let postData;
    const orderSampleXML = fs
      .readFileSync(path.resolve(__dirname, "./getOrdersSample.xml"))
      .toString()
      .replace(/\n|\r/g, "");

    mock.onPost("https://api.sandbox.ebay.com/ws/api.dll").reply(postConfig => {
      postData = postConfig;
      return [200, orderSampleXML];
    });
    const options = {
      CreateTimeFrom: "2018-03-07T23:10:24.540Z",
      CreateTimeTo: "2018-07-05T22:10:24.542Z"
    };
    const expectedPost = `<?xml version="1.0" encoding="utf-8" ?>
    <GetOrdersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <WarningLevel>High</WarningLevel>
        <OrderRole>Seller</OrderRole>
        <OrderStatus>Completed</OrderStatus>
        <CreateTimeFrom>2018-03-07T23:10:24.540Z</CreateTimeFrom>
        <CreateTimeTo>2018-07-05T22:10:24.542Z</CreateTimeTo>
        <Pagination>
            <EntriesPerPage>100</EntriesPerPage>
            <PageNumber>1</PageNumber>
        </Pagination>
    </GetOrdersRequest>`;
    return ebayClient.getOrders(options).then(result => {
      assert.deepEqual(
        JSON.parse(toJson(postData.data)),
        JSON.parse(toJson(expectedPost))
      );
      assert(result.GetOrdersResponse);
      assert(result.GetOrdersResponse.OrderArray.Order.length === 13);
    });
  });

  it("getOrders is able to handle pagination correctly", () => {
    const ebayClient = new EbayClient(OAuthClientData);
    let postData;
    const pages = [1, 2, 3].map(number =>
      fs
        .readFileSync(
          path.resolve(__dirname, `./getOrdersPagination/${number}.xml`)
        )
        .toString()
    );

    mock.onPost("https://api.sandbox.ebay.com/ws/api.dll").reply(postConfig => {
      postData = postConfig;
      const pageInfo = /<PageNumber>(\d+)<\/PageNumber>/.exec(postConfig.data);
      if (pageInfo && pageInfo[1]) {
        return [200, pages[parseInt(pageInfo[1]) - 1]];
      }
      return [200, Page1];
    });

    return ebayClient.getOrders().then(result => {
      assert.equal(result.GetOrdersResponse.OrderArray.Order.length, 13);
    });
  });

  it("getUser is able to post correctly", () => {
    const ebayClient = new EbayClient(OAuthClientData);
    let postData;

    const getUserSampleXML = fs
      .readFileSync(path.resolve(__dirname, "./getUserSample.xml"))
      .toString();

    const expected = `<?xml version="1.0" encoding="utf-8" ?>
    <GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
	    <DetailLevel>ReturnAll</DetailLevel>
    </GetUserRequest>`;

    mock.onPost("https://api.sandbox.ebay.com/ws/api.dll").reply(postConfig => {
      postData = postConfig;
      return [200, getUserSampleXML];
    });

    return ebayClient.getUser().then(result => {
      assert.deepEqual(
        JSON.parse(toJson(postData.data)),
        JSON.parse(toJson(expected))
      );
      assert(result.GetUserResponse.User);
    });
  });

  it("compeleteSale is able to post correctly", () => {
    const ebayClient = new EbayClient(OAuthClientData);
    let postData;

    const completeSaleSample = fs
      .readFileSync(path.resolve(__dirname, "./completeSaleSample.xml"))
      .toString();

    mock.onPost("https://api.sandbox.ebay.com/ws/api.dll").reply(postConfig => {
      postData = postConfig;
      return [200, completeSaleSample];
    });

    const expected = `<?xml version="1.0" encoding="utf-8" ?>
    <CompleteSaleRequest xmlns="urn:ebay:apis:eBLBaseComponents">
      <ErrorLanguage>en_US</ErrorLanguage>
      <WarningLevel>High</WarningLevel>
      <OrderLineItemID>TESTTESTTEST10</OrderLineItemID>
      <Shipment>
        <ShipmentTrackingDetails>
          <ShipmentTrackingNumber>111111111111</ShipmentTrackingNumber>
          <ShippingCarrierUsed>USPS</ShippingCarrierUsed>
        </ShipmentTrackingDetails>
      </Shipment>
    </CompleteSaleRequest>`;

    const options = {
      OrderLineItemID: "TESTTESTTEST10",
      Shipment: {
        ShipmentTrackingDetails: {
          ShipmentTrackingNumber: "111111111111",
          ShippingCarrierUsed: "USPS"
        }
      }
    };

    return ebayClient.completeSale(options).then(result => {
      assert.deepEqual(
        JSON.parse(toJson(postData.data)),
        JSON.parse(toJson(expected))
      );
      assert(result.CompleteSaleResponse.Ack);
    });
  });
});
