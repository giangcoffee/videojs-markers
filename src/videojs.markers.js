/*
 * videojs-markers
 * @flow
 */

'use strict';

import videojs from 'video.js';

type Marker = {
  time: number,
  duration: number,
  text?: string,
  class?: string,
  overlayText?: string,
  // private property
  key: string,
};

// default setting
const defaultSetting = {
  markerStyle: {
    'width':'7px',
    'border-radius': '30%',
    'background-color': 'red',
  },
  markerTip: {
    display: true,
    text: function(marker) {
      return "Break: " + marker.text;
    },
    time: function(marker) {
      return marker.time;
    },
  },
  breakOverlay:{
    display: false,
    displayTime: 3,
    text: function(marker) {
      return "Break overlay: " + marker.overlayText;
    },
    style: {
      'width':'100%',
      'height': '20%',
      'background-color': 'rgba(0,0,0,0.7)',
      'color': 'white',
      'font-size': '17px',
    },
  },
  onMarkerClick: function(marker) {},
  onMarkerReached: function(marker, index) {},
  onMarkerTextKeyPress: function(marker, index) {},
  onMarkerTextDeleted: function(marker, index) {},
  markers: [],
};


/**
 * Returns the size of an element and its position
 * a default Object with 0 on each of its properties
 * its return in case there's an error
 * @param  {Element} element  el to get the size and position
 * @return {DOMRect|Object}   size and position of an element
 */
function getElementBounding(element) {
  var elementBounding;
  const defaultBoundingRect = {
    top: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    right: 0
  };

  try {
    elementBounding = element.getBoundingClientRect();
  } catch (e) {
    elementBounding = defaultBoundingRect;
  }

  return elementBounding;
}

const NULL_INDEX = -1;

function registerVideoJsMarkersPlugin(options) {
  // copied from video.js/src/js/utils/merge-options.js since
  // videojs 4 doens't support it by defualt.
  if (!videojs.mergeOptions) {
    function isPlain(value) {
      return !!value && typeof value === 'object' &&
        toString.call(value) === '[object Object]' &&
        value.constructor === Object;
    }
    function mergeOptions(source1: Object, source2: Object) {

      const result = {};
      const sources = [source1, source2];
      sources.forEach(source => {
        if (!source) {
          return;
        }
        Object.keys(source).forEach(key => {
          let value = source[key];
          if (!isPlain(value)) {
            result[key] = value;
            return;
          }
          if (!isPlain(result[key])) {
            result[key] = {};
          }
          result[key] = mergeOptions(result[key], value);
        })
      });
      return result;
    }
    videojs.mergeOptions = mergeOptions;
  }

  if (!videojs.createEl) {
    videojs.createEl = function(tagName: string, props: Object, attrs?: Object): void {
      const el = videojs.Player.prototype.createEl(tagName, props);
      if (!!attrs) {
        Object.keys(attrs).forEach(key => {
          el.setAttribute(key, attrs[key]);
        });
      }
      return el;
    }
  }
  

  /**
   * register the markers plugin (dependent on jquery)
   */
  let setting = videojs.mergeOptions(defaultSetting, options),
      markersMap: {[key:string]: Marker} = {},
      markersList: Array<Marker>  = [], // list of markers sorted by time
      currentMarkerIndex  = NULL_INDEX,
      player       = this,
      markerTip    = null,
      breakOverlay = null,
      overlayIndex = NULL_INDEX;

  function sortMarkersList(): void {
    // sort the list by time in asc order
    markersList.sort((a, b) => {
      return setting.markerTip.time(a) - setting.markerTip.time(b);
    });
  }

  function addMarkers(newMarkers: Array<Marker>): void {
    newMarkers.forEach((marker: Marker) => {
      player.el().querySelector('.vjs-progress-holder')
        .appendChild(createMarkerDiv(marker));

      // store marker in an internal hash map
      markersMap[marker.key] = marker;
      markersList.push(marker);
    });

    sortMarkersList();
  }

  function getPosition(marker: Marker): number {
    return (setting.markerTip.time(marker) / player.duration()) * 100;
  }

  function setMarkderDivStyle(marker: Marker, markerDiv: Object): void {
    markerDiv.className = `vjs-bookmark ${marker.class || ""}`;

      var textarea = videojs.createEl('textarea', {
          className: 'marker-content',
          innerText: marker.text,
          'style': "height: 35px;",
          'placeholder': "enter bookmark title",
          name: 'bookmark_title'
      }, {
          'marker-id': marker.key,
          'maxlength': 140
      });

      var deleteIcon = videojs.createEl('span', {
          className: 'udi udi-delete',
          id: 'delete-icon-' + marker.key
      });

      var checkIcon = videojs.createEl('span', {
          className: 'udi udi-check',
          id: 'check-icon-' + marker.key
      });

      var label= videojs.createEl('label', {
          className: 'sr-only',
          for: 'bookmark_title',
          innerText: 'Bookmark title'
      });

      var bookmarkIcon = videojs.createEl('span', {
          className: 'udi udi-bookmark'
      });

      var textCounter = videojs.createEl('span', {
          className: 'vjs-bookmark__content__counter',
          id: 'text-counter-' + marker.key,
          innerText: 140 - textarea.value.length
      });

      var bookMarkContent = videojs.createEl('div', {
          className: 'vjs-bookmark__content',
          id: 'marker-tip-' + marker.key
      });

      bookMarkContent.appendChild(bookmarkIcon);
      bookMarkContent.appendChild(label);
      bookMarkContent.appendChild(textarea);
      bookMarkContent.appendChild(textCounter);
      bookMarkContent.appendChild(deleteIcon);
      bookMarkContent.appendChild(checkIcon);

      var container = videojs.createEl('div', {});
      container.appendChild(bookMarkContent);

      markerDiv.appendChild(container);

      if (typeof setting.onMarkerTextKeyPress === "function") {
          // if return false, prevent default behavior
          textarea.addEventListener('keypress', function(event) {
              setting.onMarkerTextKeyPress(event, textarea, textCounter);
          });
      }

      if (typeof setting.onMarkerTextDeleted === 'function') {
          deleteIcon.addEventListener('click', function(event) {
              setting.onMarkerTextDeleted(event, textarea, textCounter);
          });
      }

    Object.keys(setting.markerStyle).forEach(key => {
      markerDiv.style[key] = setting.markerStyle[key];
    });

    // hide out-of-bound markers
    const ratio = marker.time / player.duration();
    if (ratio < 0 || ratio > 1) {
      markerDiv.style.display = 'none';
    }

    // set position
    markerDiv.style.left = getPosition(marker) + '%';
    if (marker.duration) {
      markerDiv.style.width = (marker.duration / player.duration()) * 100 + '%';
      markerDiv.style.marginLeft = '0px';
    } else {
      const markerDivBounding = getElementBounding(markerDiv);
      markerDiv.style.marginLeft = markerDivBounding.width / 2 + 'px';
    }
  }

  function createMarkerDiv(marker: Marker): Object {

    var markerDiv = videojs.createEl('div', {}, {
      'data-marker-id': marker.key,
      'data-marker-time': setting.markerTip.time(marker)
    });

    setMarkderDivStyle(marker, markerDiv);

    // bind click event to seek to marker time
    markerDiv.addEventListener('click', function(e) {
      var preventDefault = false;
      if (typeof setting.onMarkerClick === "function") {
        // if return false, prevent default behavior
        preventDefault = setting.onMarkerClick(marker) === false;
      }

      if (!preventDefault) {
        var key = this.getAttribute('data-marker-id');
        player.currentTime(setting.markerTip.time(markersMap[key]));
      }
    });

    if (setting.markerTip.display) {
      registerMarkerTipHandler(markerDiv);
    }

    return markerDiv;
  }

  function updateMarkers(force: boolean): void {
    // update UI for markers whose time changed
    markersList.forEach((marker: Marker) => {
      var markerDiv = player.el().querySelector(".vjs-bookmark[data-marker-id='" + marker.key +"']");
      var markerTime = setting.markerTip.time(marker);

      if (force || markerDiv.getAttribute('data-marker-time') !== markerTime) {
        setMarkderDivStyle(marker, markerDiv);
        markerDiv.setAttribute('data-marker-time', markerTime);
      }
    });
    sortMarkersList();
  }

  function removeByKey(key: string): void {
      var totalMarkers = markersList.length;
      var indexes = [];
      for (var i =0; i < totalMarkers; i++) {
          if (markersList[i].key === key) {
              indexes.push(i);
              break;
          }
      }

      if (indexes.length > 0) {
          removeMarkers(indexes);
      }
  }

  function removeMarkers(indexArray: Array<number>): void {
    // reset overlay
    if (!!breakOverlay){
      overlayIndex = NULL_INDEX;
      breakOverlay.style.visibility = "hidden";
    }
    currentMarkerIndex = NULL_INDEX;

    let deleteIndexList: Array<number> = [];
    indexArray.forEach((index: number) => {
      let marker = markersList[index];
      if (marker) {
        // delete from memory
        delete markersMap[marker.key];
        deleteIndexList.push(index);

        // delete from dom
        let el = player.el().querySelector(".vjs-bookmark[data-marker-id='" + marker.key +"']");
        el && el.parentNode.removeChild(el);
      }
    });

    // clean up markers array
    deleteIndexList.reverse();
    deleteIndexList.forEach((deleteIndex: number) => {
      markersList.splice(deleteIndex, 1);
    });

    // sort again
    sortMarkersList();
  }

  // attach hover event handler
  function registerMarkerTipHandler(markerDiv: Object): void {
    markerDiv.addEventListener('mouseover', () => {
      markerDiv.classList.add('vjs-bookmark--focus');
        let textarea = markerDiv.querySelector('textarea');
        textarea.focus();
        let length = textarea.value.length;
        textarea.setSelectionRange(length, length);

        markerDiv.querySelector('.udi-delete').classList.remove('hide');
        markerDiv.querySelector('.vjs-bookmark__content').classList.remove('hide');
        markerDiv.querySelector('.udi-check').classList.remove('show');
    });

    markerDiv.addEventListener('mouseout',() => {
        markerDiv.classList.remove('vjs-bookmark--focus');
    });
  }

  // show or hide break overlays
  function updateBreakOverlay(): void {
    if (!setting.breakOverlay.display || currentMarkerIndex < 0) {
      return;
    }

    var currentTime = player.currentTime();
    var marker = markersList[currentMarkerIndex];
    var markerTime = setting.markerTip.time(marker);

    if (
      currentTime >= markerTime &&
      currentTime <= (markerTime + setting.breakOverlay.displayTime)
    ) {
      if (overlayIndex !== currentMarkerIndex) {
        overlayIndex = currentMarkerIndex;
        if (breakOverlay) {
          breakOverlay.querySelector('.vjs-break-overlay-text').innerHTML = setting.breakOverlay.text(marker);
        }
      }

      if (breakOverlay) {
        breakOverlay.style.visibility = "visible";
      }
    } else {
      overlayIndex = NULL_INDEX;
      if (breakOverlay) {
        breakOverlay.style.visibility = "hidden";
      }
    }
  }

  // problem when the next marker is within the overlay display time from the previous marker
  function initializeOverlay(): void {
    breakOverlay = videojs.createEl('div', {
      className: 'vjs-break-overlay',
      innerHTML: "<div class='vjs-break-overlay-text'></div>"
    });
    Object.keys(setting.breakOverlay.style).forEach(key => {
      if (breakOverlay) {
        breakOverlay.style[key] = setting.breakOverlay.style[key];
      }
    });
    player.el().appendChild(breakOverlay);
    overlayIndex = NULL_INDEX;
  }

  function onTimeUpdate(): void {
    onUpdateMarker();
    updateBreakOverlay();
    options.onTimeUpdateAfterMarkerUpdate && options.onTimeUpdateAfterMarkerUpdate();
  }

  function onUpdateMarker() {
    /*
      check marker reached in between markers
      the logic here is that it triggers a new marker reached event only if the player
      enters a new marker range (e.g. from marker 1 to marker 2). Thus, if player is on marker 1 and user clicked on marker 1 again, no new reached event is triggered)
    */
    if (!markersList.length) {
      return;
    }

    var getNextMarkerTime = (index: number) => {
      if (index < markersList.length - 1) {
        return setting.markerTip.time(markersList[index + 1]);
      }
      // next marker time of last marker would be end of video time
      return player.duration();
    }
    var currentTime = player.currentTime();
    var newMarkerIndex = NULL_INDEX;

    if (currentMarkerIndex !== NULL_INDEX) {
      // check if staying at same marker
      var nextMarkerTime = getNextMarkerTime(currentMarkerIndex);
      if(
        currentTime >= setting.markerTip.time(markersList[currentMarkerIndex]) &&
        currentTime < nextMarkerTime
      ) {
        return;
      }

      // check for ending (at the end current time equals player duration)
      if (
        currentMarkerIndex === markersList.length - 1 &&
        currentTime === player.duration()
      ) {
        return;
      }
    }

    // check first marker, no marker is selected
    if (currentTime < setting.markerTip.time(markersList[0])) {
      newMarkerIndex = NULL_INDEX;
    } else {
      // look for new index
      for (var i = 0; i < markersList.length; i++) {
        nextMarkerTime = getNextMarkerTime(i);
        if (
          currentTime >= setting.markerTip.time(markersList[i]) &&
          currentTime < nextMarkerTime
        ) {
          newMarkerIndex = i;
          break;
        }
      }
    }

    // set new marker index
    if (newMarkerIndex !== currentMarkerIndex) {
      // trigger event if index is not null
      if (newMarkerIndex !== NULL_INDEX && options.onMarkerReached) {
        options.onMarkerReached(markersList[newMarkerIndex], newMarkerIndex);
      }
      currentMarkerIndex = newMarkerIndex;
    }
  }

  // setup the whole thing
  function initialize(): void {
    // if (setting.markerTip.display) {
    //   initializeMarkerTip();
    // }

    // remove existing markers if already initialized
    player.markers.removeAll();
    addMarkers(setting.markers);

    if (setting.breakOverlay.display) {
      initializeOverlay();
    }
    onTimeUpdate();
    player.on("timeupdate", onTimeUpdate);
    player.off("loadedmetadata");
  }

  // setup the plugin after we loaded video's meta data
  player.on("loadedmetadata", function() {
    initialize();
  });

  // exposed plugin API
  player.markers = {
    getMarkers: function(): Array<Marker> {
      return markersList;
    },
    next : function(): void {
      // go to the next marker from current timestamp
      const currentTime = player.currentTime();
      for (var i = 0; i < markersList.length; i++) {
        var markerTime = setting.markerTip.time(markersList[i]);
        if (markerTime > currentTime) {
          player.currentTime(markerTime);
          break;
        }
      }
    },
    prev : function(): void {
      // go to previous marker
      const currentTime = player.currentTime();
      for (var i = markersList.length - 1; i >= 0 ; i--) {
        var markerTime = setting.markerTip.time(markersList[i]);
        // add a threshold
        if (markerTime + 0.5 < currentTime) {
          player.currentTime(markerTime);
          return;
        }
      }
    },
    add : function(newMarkers: Array<Marker>): void {
      // add new markers given an array of index
      addMarkers(newMarkers);
    },
    remove: function(indexArray: Array<number>): void {
      // remove markers given an array of index
      removeMarkers(indexArray);
    },
    removeByKey: function(key: string) {
        removeByKey(key);
    },
    removeAll: function(): void {
      var indexArray = [];
      for (var i = 0; i < markersList.length; i++) {
        indexArray.push(i);
      }
      removeMarkers(indexArray);
    },
    // force - force all markers to be updated, regardless of if they have changed or not.
    updateTime: function(force: boolean): void {
      // notify the plugin to update the UI for changes in marker times
      updateMarkers(force);
    },
    reset: function(newMarkers: Array<Marker>): void {
      // remove all the existing markers and add new ones
      player.markers.removeAll();
      addMarkers(newMarkers);
    },
    destroy: function(): void {
      // unregister the plugins and clean up even handlers
      player.markers.removeAll();
      breakOverlay && breakOverlay.remove();
      markerTip && markerTip.remove();
      player.off("timeupdate", updateBreakOverlay);
      delete player.markers;
    },
  };
}

videojs.plugin('markers', registerVideoJsMarkersPlugin);
