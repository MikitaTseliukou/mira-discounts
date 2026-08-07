(function () {
  var config = window.__freeOvumWandsGift || {};

  // TODO: replace with the real Max Wands / Ovum Wands numeric variant IDs.
  // These must stay in sync with the variant GIDs used in the
  // free-ovum-wands discount function.
  var MAX_WANDS_VARIANT_IDS = [47027188793637, 47027188793637];
  var OVUM_WANDS_VARIANT_ID = 51080530264357;

  var MIN_SUBTOTAL_CENTS = 6000; // $60.00
  var ELIGIBLE_COUNTRY_CODE = "GB";
  var GIFT_PROPERTY_KEY = "_free_ovum_wands_gift";

  var nativeFetch = window.fetch.bind(window);
  var syncing = false;
  var pendingResync = false;

  function isEligible(cart) {
    if (config.countryCode !== ELIGIBLE_COUNTRY_CODE) {
      return false;
    }

    var hasMaxWands = cart.items.some(function (item) {
      return MAX_WANDS_VARIANT_IDS.indexOf(item.variant_id) !== -1;
    });
    if (!hasMaxWands) {
      return false;
    }

    var subtotal = cart.items.reduce(function (total, item) {
      if (
        item.variant_id === OVUM_WANDS_VARIANT_ID &&
        item.properties &&
        item.properties[GIFT_PROPERTY_KEY]
      ) {
        return total;
      }
      return total + item.line_price;
    }, 0);

    return subtotal >= MIN_SUBTOTAL_CENTS;
  }

  function findGiftLine(cart) {
    return cart.items.find(function (item) {
      return (
        item.variant_id === OVUM_WANDS_VARIANT_ID &&
        item.properties &&
        item.properties[GIFT_PROPERTY_KEY] === "true"
      );
    });
  }

  function addGift() {
    var properties = {};
    properties[GIFT_PROPERTY_KEY] = "true";

    return nativeFetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: OVUM_WANDS_VARIANT_ID, quantity: 1, properties: properties }],
      }),
    });
  }

  function removeGift(giftLine) {
    return nativeFetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: giftLine.key, quantity: 0 }),
    });
  }

  function sync() {
    if (syncing) {
      pendingResync = true;
      return;
    }
    syncing = true;

    nativeFetch("/cart.js", { headers: { Accept: "application/json" } })
      .then(function (response) {
        return response.json();
      })
      .then(function (cart) {
        var eligible = isEligible(cart);
        var giftLine = findGiftLine(cart);

        console.log(eligible, giftLine, "eligible");

        if (eligible && !giftLine) {
          return addGift();
        }
        if (!eligible && giftLine) {
          return removeGift(giftLine);
        }
      })
      .catch(function (error) {
        console.error("[free-ovum-wands-gift] cart sync failed", error);
      })
      .then(function () {
        syncing = false;
        if (pendingResync) {
          pendingResync = false;
          sync();
        }
      });
  }

  // Shopify 2.0 themes talk to the cart through fetch(); watch those calls
  // so the gift stays in sync with whatever added/removed the cart contents.
  window.fetch = function (input, init) {
    var result = nativeFetch(input, init);
    var url = typeof input === "string" ? input : input && input.url;
    if (typeof url === "string" && /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/.test(url)) {
      result.then(sync, sync);
    }
    return result;
  };

  document.addEventListener("DOMContentLoaded", sync);
  window.addEventListener("pageshow", sync);
})();
