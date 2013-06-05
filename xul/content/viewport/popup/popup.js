/*  This file is part of xulSword.

    Copyright 2009 John Austin (gpl.programs.info@gmail.com)

    xulSword is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    xulSword is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with xulSword.  If not, see <http://www.gnu.org/licenses/>.
*/
const POPUPDELAY = 250;
const POPUPDELAY_STRONGS = 1000;

var Popup;

function initWindowedPopup() {

  initCSS();
  
  // This is a windowed popup, so copy the original popup
  Popup = new PopupObj(ViewPort.ownerDocument.defaultView.Popup);
  
  // Close the original popup
  ViewPort.ownerDocument.defaultView.Popup.close();

}
    
function PopupObj(popupobj) {

  this.npopup = document.getElementById("npopup");
  this.npopupTX = document.getElementById("npopupTX");
  this.showPopupID = null;
    
  if (popupobj) {
    this.npopup.setAttribute("puptype", popupobj.npopup.getAttribute("puptype"));
    this.npopupTX.innerHTML = popupobj.npopupTX.innerHTML;
    this.crnote = popupobj.crnote;
    this.srnote = popupobj.srnote;
  }

  // returns false if popup cannot open for any reason
  this.activate = function(elem, e) {
//jsdump("Activating Popup in " + window.name + ":" + elem.className + ", " + e.type);    

    // get our event element's type and mod etc.
    var type = elem.className.match(/^([^\s\-]+)?/)[0];
    var p = getElementInfo(elem); // p may be null because not all handled elements are in TextClasses
    
    this.crnote = null; // for module select feature
    this.srnote = null; // for module select feature
   
    // did this event originate from inside this popup?
    var updatingPopup = elem;
    while (updatingPopup && updatingPopup !== this.npopup) {updatingPopup = updatingPopup.parentNode;}
    
    // Begin building HTML for the popup
    var html = "";
    html += "<div class=\"popupheader cs-Program\">";
    html +=   "<div class=\"towindow\" onclick=\"Popup.towindow();\"></div>";
    html +=   "<a class=\"" + (updatingPopup ? "popupBackLink":"popupCloseLink") + "\">";
    html +=     XSBundle.getString(updatingPopup ? "back":"close");
    html +=   "</a>";
    
    html +=   "<select class=\"popup-mod-select\" onchange=\"Popup.select(this.value);\" >";
    if (p && p.mod && (/^(cr|sr)$/).test(p.type)) {
      for (var t=0; t<Tabs.length; t++) {
        if (Tabs[t].modType != BIBLE) continue;
        
        // dictionary modules may have a "ReferenceBible" conf entry
        var referenceBible = p.mod;
        if (Tab[referenceBible].modType == DICTIONARY) {
          var aref = LibSword.getModuleInformation(referenceBible, "ReferenceBible");
          if (aref && aref != NOTFOUND && Tab.hasOwnProperty(aref)) referenceBible = aref;
        }
        
        var selected = (Tabs[t].modName == referenceBible ? "selected=\"selected\" ":"");
        html += "<option value=\"" + Tabs[t].modName + "\" class=\"cs-" + Tabs[t].locName + "\" " + selected + ">" + Tabs[t].label + "</option>";
      }
    }
    html +=   "</select>";
    
    html += "</div>";
    
    // If popup is already open, then save the current popup inside the "back" link of this new popup...
    html += "<div class=\"prevhtml\" title=\"" + this.npopup.getAttribute("puptype") + "\">" + (updatingPopup ? this.npopupTX.innerHTML:"") + "</div>";

    html += "<div class=\"popup-text cs-Program\">";
    
    var res = "";
    switch (type) {
    
    case "popupBackLink":
      var old = this.npopup.getElementsByClassName("prevhtml")[0];
      this.npopup.setAttribute("puptype", old.getAttribute("title"));
      this.npopupTX.innerHTML = old.innerHTML;
      this.checkPopupPosition(e);
      return true;
      break;
      
    case "cr":
    case "fn":
    case "un":
      var w = getContextWindow(elem);
      if (!p || !p.mod || !w || !Texts.footnotes[w]) return false;
      var re = "<div class=\"nlist\" title=\"" + type + "." + escapeRE(p.title) + "\">.*?<\\/div>";
      re = new RegExp(re);
      this.crnote = Texts.footnotes[w].match(re);
      if (!this.crnote) return false;
      this.crnote = this.crnote[0];
      res = BibleTexts.getNotesHTML(this.crnote, p.mod, true, true, true, true, 1);
      break;

    case "sr":
      if ((!p || !p.mod) && !referenceBible) return false;
      referenceBible = (referenceBible ? referenceBible:p.mod);
      var entry = elem.innerHTML;
      // elem may have npopup as an appended child! So we need to remove it to get real innerHTML.
      // Note: A RegExp does not seem to be able to match innerHTML for some reason (needed escapeRE!?).
      var i = entry.indexOf("id=\"npopup\"");
      if (i != -1) {
        i = entry.lastIndexOf("<", i);
        entry = entry.substring(0, i);
      }
      this.srnote = "<div class=\"nlist\" title=\"cr.1.0.0.0." + referenceBible + "\">" + (p.reflist[0] != "unavailable" ? p.reflist.join(";"):entry) + "</div>"
      res = BibleTexts.getNotesHTML(this.srnote, referenceBible, true, true, true, true, 1);
      break;
    
    case "dtl":
    case "dt":
      if (!p || !p.reflist) return false;
      
      var dnames="", dword="", sep="";
      for (var i=0; i<p.reflist.length; i++) {
        if (!p.reflist[i]) continue;
        dnames += sep + p.reflist[i].split(":")[0];
        if (!dword) dword = p.reflist[i].split(":")[1];
        sep = ";"
      }
    
      res = DictTexts.getEntryHTML(dword, dnames);
      break;
      
    case "sn":
      var mod = getContextModule(elem);
      if (!mod) return false;

      var snlist = elem.className.split(" ");
      if (snlist && snlist.length > 1) snlist.shift(); // remove base class: sn
      else return false;
      
      var entry = elem.innerHTML;
      // elem may have npopup as an appended child! So we need to remove it to get real innerHTML.
      // Note: A RegExp does not seem to be able to match innerHTML for some reason.
      var i = entry.indexOf("id=\"npopup\"");
      if (i != -1) {
        i = entry.lastIndexOf("<", i);
        entry = entry.substring(0, i);
      }
      res = DictTexts.getLemmaHTML(snlist, entry, mod);
      break;
      
    case "introlink":
      var w = getContextWindow(elem);
      if (!w) return false;
      res = document.getElementById("text" + w).getElementsByClassName("introtext")[0].innerHTML;
      break;
      
    case "noticelink":
      var w = getContextWindow(elem);
      if (!w) return false;
      res = document.getElementById("text" + w).getElementsByClassName("noticetext")[0].innerHTML;
      break;
      
    default:
      jsdump("Unhandled popup type \"" + type + "\".\n");
      return false;
    }
    if (!res) return false;
    html += res + "</div>";
    
    this.npopup.setAttribute("puptype", type);
    this.npopupTX.innerHTML = html;
  
    // Windowed popup...
    if (window.name == "npopup") return true;
    
    // Normal popup updating itself...
    if (updatingPopup) {
      // move popup to insure it's under the current mouse position
      this.npopupTX.scrollTop = 0;
      this.npopupTX.style.top = this.YmouseDelta + e.clientY + "px";
      this.checkPopupPosition(e);
      return true;
    }
    
    // Normal popup opening anew...
    this.elem = elem;
    this.e = e;
    this.showPopupID = window.setTimeout("Popup.open();", (type == "sn" ? POPUPDELAY_STRONGS:POPUPDELAY));
    return true;
    
  };
  
  this.open = function() {

    // set max height of popup
    this.npopup.style.maxHeight = (window.innerHeight/2) + "px";
    
    // make popup appear (via CSS)
    if (this.npopup.parentNode !== this.elem)
        this.elem.appendChild(this.npopup);
  
    // store current location relative to mouse
    this.npopupTX.style.top = ""; // reset so that CSS always controls initial location!
    this.YmouseDelta = (Number(window.getComputedStyle(this.npopupTX).top.replace("px", "")) - this.e.clientY);
    
    this.checkPopupPosition(this.e);

//jsdump(this.npopupTX.innerHTML);
//window.setTimeout("debugStyle(document.getElementById('npopup'))", 1000);

  };
  
  // if popup is overflowing bottom of window, then move it up
  this.checkPopupPosition = function(e) {
    var pupbot = e.clientY + this.npopupTX.offsetHeight;
    if (pupbot > window.innerHeight) {
      var puptop = Number(window.getComputedStyle(this.npopupTX).top.replace("px", ""));
      if (isNaN(puptop)) return;
      puptop -= (pupbot - window.innerHeight);
      this.npopupTX.style.top = puptop + "px";
    }
  };

  this.close = function() {
  
    // If we're a windowed popup, just close the window
    if (window.name == "npopup") {
      window.frameElement.ownerDocument.defaultView.close();
      return;
    }
    
    // Moving the Popup will cause CSS to hide it
    document.getElementsByTagName("body")[0].appendChild(this.npopup);
  };
  
  this.select = function(mod) {
    var pt = this.npopupTX.getElementsByClassName("popup-text");
    if (!pt) return;
    pt = pt[pt.length-1]; // the pt we want is the last in the tree

    if (this.crnote) pt.innerHTML = BibleTexts.getNotesHTML(this.crnote, mod, true, true, true, true, 1);
    else if (this.srnote) pt.innerHTML = BibleTexts.getNotesHTML(this.srnote, mod, true, true, true, true, 1);
  };
  
  this.towindow = function() {
    
    // Open a pinned Popup as a separate xul window
    // Get X and Y coordinates for where to create the new xul window
    var X,Y;
    // on Linux, window.innerHeight = outerHeight = height of entire window viewport, NOT including the operating system frame
    var f = window.frameElement;
    var wintop = f.ownerDocument.defaultView;
    var offset = getOffset(this.npopupTX);
    X = Number(f.boxObject.x + offset.left);
    Y = Number(f.boxObject.y + offset.top);
    //jsdump("INFO:" + f.boxObject.y + "-" + MainWindow.outerHeight + "+" + v.height + "=" + Y);
  
    // Open the new xul Popup window.
    var p = "chrome,resizable,dependant";
    p += ",left=" + Number(wintop.screenX + X);
    p += ",top=" + Number(wintop.screenY + Y);
    p += ",width=" + this.npopupTX.offsetWidth;
    p += ",height=" + this.npopupTX.offsetHeight;
    AllWindows.push(wintop.open("chrome://xulsword/content/viewport/popup/popup.xul", "popup" + String(Math.random()), p));

  };
  
}
