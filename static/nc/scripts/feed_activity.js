(function() {
  var streamClient, streamFeed;

  /*
  Initialize Stream client and get current user timeline.
  */
  $(document).ready(function() {
    streamClient = stream.connect(STREAM_API_KEY, null, '39403');
    streamFeed = streamClient.feed(STREAM_TIMELINE_FEED, STREAM_FEED_ID, STREAM_FEED_TOKEN);

    // Load the first batch of activities by clicking the "more" button
    $('#moreButton')[0].click()
  });

  /** Load more activity items when the MORE button is clicked **/
  $('button.more').on('click', function() {
    // Get the more button container to prep for DOM
    // insertion before the div (in the activityList)
    let button = this;

    // If data-has_more has been set to "false", MORE button is at the end
    // of all records from Horizon, so don't bother fetching
    if (button.dataset.has_more == "true") {
      // Only load more if records left
      var activityListQuery = $(button.dataset.parent);

      // Set up ops for get call
      var ops = { limit: STREAM_FEED_LIMIT };
      if (button.dataset.id_lt) {
        ops["id_lt"] = button.dataset.id_lt;
      }

      // Get records, parse, then add to list of DOMs
      // TODO: Spin this GET call off into an endpoint on Nucleo servers like news list view?
      // if so, would then have the active media items for all relevant quantities.
      streamFeed.get(ops).then(function(resp) {
        // Resp Json has key, vals:
        // 'object': {'results': [ActivityItem], 'next': url, 'duration': "ms" },

        // Iterate through operation records parsing and appropriately formatting
        // the DOM object to add into newsList (before MORE button)
        var activities = [];
        resp.results.forEach(function(record) {
          activities.push(parseActivity(record));
        });

        // Append to end of newsList
        activityListQuery.append(activities);
        feather.replace(); // Call this so feather icons populate properly

        // If no next URL, then no more records to load
        if (resp.next == "") {
          button.dataset.id_lt = "";
          button.dataset.has_more = "false";
          button.classList.add("invisible");
        } else {
          // Otherwise, parse next URL for id_lt query param to store
          let nextUrl = new URL(resp.next, streamClient.baseUrl);
          button.dataset.id_lt = nextUrl.searchParams.get("id_lt");
          button.dataset.has_more = "true";
        }
      })
      .catch(function (err) {
        console.error('Unable to load feed activities', err);
      });
    }
  });

  /** Parse activity record and format appropriately for activity list **/
  function parseActivity(record) {
    // Returns DOM element for insertion into activityList before MORE button
    // EXAMPLE:
    // <li class="list-group-item d-flex justify-content-between flex-wrap p-4">
    //   <div class="d-flex align-content-start">
    //     <div class="position-relative">
    //       <a href=""><img class="img-object-fit-cover rounded" style="height: 60px; width: 60px;" src="{{ profile.pic.url }}" alt=""></a>
    //       <a href=""><img class="img-object-fit-cover img-thumbnail rounded-circle position-absolute" style="height: 40px; width: 40px; top: -15px; left: -15px;" src="{% static 'nc/images/rocket.png' %}" alt=""></a>
    //     </div>
    //     <div class="flex-column align-items-start mx-3">
    //       <span><a href="" class="text-dark font-weight-bold">@mikey.rf</a> sent 0.75 <a href="" class="text-dark font-weight-bold">XLM</a> to <a href="" class="text-dark font-weight-bold">@feld27</a></span>
    //       <div><small class="text-muted">15 days ago</small></div>
    //       <div><small>Tx #: <a href="https://horizon-testnet.stellar.org/transactions/bfaf2287695c651747e635ca7e03698ba44611ed9a6b919bd1db9727a0b6dfda" class="text-info" title="Stellar Transaction Hash" target="_blank">bfaf221...0b6dfda</a></small></div>
    //     </div>
    //   </div>
    //   <span data-feather="send"></span>
    // </li>

    // Build the full DOM li list item object
    var li = document.createElement("li");
    li.setAttribute("class", "list-group-item d-flex justify-content-between flex-wrap p-4");

    var contentDiv = document.createElement("div");
    contentDiv.setAttribute("class", "d-flex align-content-start");
    li.append(contentDiv);

    // Profile pic container for relevant image(s): actor pic
    // and object/asset pic
    var picContentDiv = document.createElement("div");
    picContentDiv.setAttribute("class", "position-relative");

    var actorPicA = document.createElement("a");
    actorPicA.setAttribute("href", record.actor_href);

    var actorPicImg = document.createElement("img");
    actorPicImg.setAttribute("class", "img-object-fit-cover rounded");
    actorPicImg.style.width = "60px";
    actorPicImg.style.height = "60px";
    if (record.actor_pic_url) {
      actorPicImg.setAttribute("src", record.actor_pic_url);
    }
    actorPicA.append(actorPicImg);
    picContentDiv.append(actorPicA);
    contentDiv.append(picContentDiv);

    let otherHrefAttribute = (record.verb == 'send' ? 'asset_href' : 'object_href'),
        otherPicUrlAttribute = (record.verb == 'send' ? 'asset_pic_url' : 'object_pic_url'),
        otherHasHref = otherHrefAttribute in record,
        otherHasPicUrl = otherPicUrlAttribute in record;

    var otherPicA = document.createElement("a");
    // Check whether object/asset has been registered in Nucleo db
    if (otherHasHref) {
      otherPicA.setAttribute("href", record[otherHrefAttribute]);
    }

    var otherPicImg = document.createElement("img");
    if (record.verb == 'follow') {
      otherPicImg.setAttribute("class", "img-object-fit-cover img-thumbnail rounded position-absolute");
    } else {
      otherPicImg.setAttribute("class", "img-object-fit-cover img-thumbnail rounded-circle position-absolute");
    }
    otherPicImg.style.height = "40px";
    otherPicImg.style.width = "40px";
    otherPicImg.style.top = "-15px";
    otherPicImg.style.left = "-15px";
    if (otherHasPicUrl) {
      otherPicImg.setAttribute("src", record[otherPicUrlAttribute]);
    }
    otherPicA.append(otherPicImg);
    picContentDiv.append(otherPicA);
    contentDiv.append(picContentDiv);

    // Description container for all the relevant
    // activity details
    var descriptionContentDiv = document.createElement("div");
    descriptionContentDiv.setAttribute("class", "flex-column align-items-start mx-3");

    var descriptionSpan = document.createElement("span"),
        timeSinceDiv = document.createElement("div"),
        timeSinceSmall = document.createElement("small"),
        timeSince = moment(record.time + "Z").fromNow(), // NOTE: Stellar horizon created_at attribute stored in stream record.time implicitly assumes UTC so add Z here
        timeSinceText = document.createTextNode(timeSince);

    // Timesince div in description container
    timeSinceSmall.setAttribute("class", "text-muted");
    timeSinceSmall.appendChild(timeSinceText);
    timeSinceDiv.appendChild(timeSinceSmall);

    // Append description and time since to outer description container
    descriptionContentDiv.append(descriptionSpan);
    descriptionContentDiv.append(timeSinceDiv);
    contentDiv.append(descriptionContentDiv);

    // Tx hash div in description container
    if (record.foreign_id || record.tx_hash) {
      let recordTxHash = (record.foreign_id ? record.foreign_id : record.tx_hash);
      var txHashDiv = document.createElement("div"),
          txHash = recordTxHash.substring(0, 7) + '...' + recordTxHash.substring(recordTxHash.length-7),
          txHashSmall = document.createElement("small"),
          txHashText = document.createTextNode("Tx #: "),
          txHashA = document.createElement("a"),
          txHashAText = document.createTextNode(txHash);

      txHashA.setAttribute("class", "text-info");
      txHashA.setAttribute("title", "Stellar Transaction Hash");
      txHashA.setAttribute("target", "_blank");
      if (record.tx_href) {
        txHashA.setAttribute("href", record.tx_href);
      }
      txHashA.appendChild(txHashAText);

      txHashDiv.appendChild(txHashSmall);
      txHashSmall.appendChild(txHashText);
      txHashSmall.appendChild(txHashA);
      txHashA.appendChild(txHashAText);
      descriptionContentDiv.append(txHashDiv);
    }

    // Feather icon container for activity icon type
    var featherIconSpan = document.createElement("span");
    li.append(featherIconSpan);

    // Determine feather icon and fill in description details
    // Four activity verb types
    //    1. Payments (verb: send)
    //    2. Token issuance (verb: issue)
    //    3. Buy/sell of asset (verb: offer)
    //    4. Follow user (verb: follow)
    var featherIcon, assetText,
        actorA = document.createElement("a"),
        objectA = document.createElement("a");

    actorA.setAttribute("class", "text-dark font-weight-bold");
    actorA.setAttribute("href", record.actor_href);
    actorA.append(document.createTextNode("@" + record.actor_username));

    objectA.setAttribute("class", "text-dark font-weight-bold");
    if (record.object_href) {
      objectA.setAttribute("href", record.object_href);
    }

    switch(record.verb) {
      case "send":
        // Sending payment to user
        // e.x.: <span><a href="" class="text-dark font-weight-bold">@mikey.rf</a> sent 0.75 <a href="" class="text-dark font-weight-bold">XLM</a> to <a href="" class="text-dark font-weight-bold">@feld27</a></span>
        featherIcon = "send";

        objectA.append(document.createTextNode("@" + record.object_username));

        // Asset code a
        assetA = document.createElement("a");
        assetA.setAttribute("class", "text-dark font-weight-bold");
        if (record.asset_href) {
          assetA.setAttribute("href", record.asset_href);
        }
        assetText = (record.asset_type == 'native'? 'XLM': record.asset_code);
        assetA.append(document.createTextNode(assetText));

        descriptionSpan.append(actorA);
        descriptionSpan.append(document.createTextNode(" sent " + record.amount + " "));
        descriptionSpan.append(assetA);
        descriptionSpan.append(document.createTextNode(" to "));
        descriptionSpan.append(objectA);
        break;
      case "issue":
        // Token issuance
        // e.x.: <span>Tokens issued: <a href="" class="text-dark font-weight-bold">@mikey.rf</a> issued 1000 new <a href="" class="text-dark font-weight-bold">NUCL</a></span>
        featherIcon = "anchor";

        assetText = (record.object_type == 'native'? 'XLM': record.object_code);
        objectA.append(document.createTextNode(assetText));

        // New tokens title
        var tokenSpan = document.createElement("span");
        tokenSpan.setAttribute("class", "font-italic");
        tokenSpan.append(document.createTextNode("New tokens: "))

        // Account issuer a
        var accountA = document.createElement("a"),
            accountHref = STELLAR_SERVER_URL + '/accounts/' + record.object_issuer,
            accountPublicKey = record.object_issuer.substring(0, 7) + '...' + record.object_issuer.substring(record.object_issuer.length-7);
        accountA.setAttribute("class", "text-info");
        accountA.setAttribute("target", "_blank");
        accountA.setAttribute("href", accountHref);
        accountA.append(document.createTextNode(accountPublicKey));

        descriptionSpan.append(tokenSpan);
        descriptionSpan.append(actorA);
        descriptionSpan.append(document.createTextNode(" issued " + record.amount + " "));
        descriptionSpan.append(objectA);
        descriptionSpan.append(document.createTextNode(" from "));
        descriptionSpan.append(accountA);
        break;
      case "offer":
        // Trading offers
        // e.x.: <span><a href="" class="text-dark font-weight-bold">@mikey.rf</a> bought/sold 100.00 <a href="" class="text-dark font-weight-bold">MOBI</a> at a price of 4.132 XLM/MOBI</span>
        featherIcon = "trending-up";

        assetText = (record.object_type == 'native'? 'XLM': record.object_code);
        objectA.append(document.createTextNode(assetText));

        let action = (record.offer_type == "buying" ? 'bought' : 'sold'),
            amount = (record.offer_type == "buying" ? String(parseFloat(record.price) * parseFloat(record.amount)) : record.amount),
            price = (record.offer_type == "buying" ? record.price : String(new BigNumber(1).dividedBy(new BigNumber(record.price).toPrecision(15)).toFixed(7)));

        descriptionSpan.append(actorA);
        descriptionSpan.append(document.createTextNode(" " + action + " " + amount + " "));
        descriptionSpan.append(objectA);
        descriptionSpan.append(document.createTextNode(" at a price of " + price + " XLM/" + assetText));
        break;
      case "follow":
        // Following user activity
        // e.x.: <span><a href="" class="text-dark font-weight-bold">@mikey.rf</a> started following <a href="" class="text-dark font-weight-bold">@feld27</a></span>
        featherIcon = "activity";

        objectA.append(document.createTextNode("@" + record.object_username));

        descriptionSpan.append(actorA);
        descriptionSpan.append(document.createTextNode(" started following "));
        descriptionSpan.append(objectA);
        break;
    }

    // Add the feather icon to list item then return li
    featherIconSpan.setAttribute("data-feather", featherIcon);
    return li;
  }
})();
