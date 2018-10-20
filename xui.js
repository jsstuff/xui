// xui <https://github.com/jsstuff/xui>
(function() {
"use strict";

const VERSION = "0.0.1";

const global = this;
const xmo = global.xmo;

const hasOwn = Object.prototype.hasOwnProperty;
const freeze = Object.freeze;
const isArray = Array.isArray;

function $dict(src) {
  const out = Object.create(null);
  if (src) {
    if (isArray(src)) {
      const arr = src;
      for (var i = 0; i < arr.length; i++)
        out[arr[i]] = true;
    }
    else {
      Object.assign(out, src);
    }
  }
  return out;
}

function $enum(src) {
  const out = $dict(src);
  const index = new Map();

  for (var k in out)
    index.set(out[k], k);

  Object.defineProperty(out, "$index", {
    value       : index,
    enumerable  : false,
    writable    : false,
    configurable: false
  });

  return out;
}

const NoArray = freeze([]);
const NoObject = freeze($dict());

// ============================================================================
// [xui]
// ============================================================================

const xui = (function() { return global.xui ? global.xui : (global.xui = $dict()); })();
xui.VERSION = VERSION;

// ============================================================================
// [xui.lang]
// ============================================================================

const lang = xui.lang = $dict();
lang.dict = $dict;
lang.enum = $enum;

function isNumberOrNull(value) {
  return typeof value === "number" || value === null;
}
lang.isNumberOrNull = isNumberOrNull;

function firstUpper(str) {
  const s = String(str);
  return s.charAt(0).toUpperCase() + s.substr(1);
};
lang.firstUpper = firstUpper;

function throwError(msg) {
  throw new Error(msg);
}
lang.throwError = throwError;

function isEmpty(obj) {
  if (!obj || typeof obj !== "object")
    return true;

  if (isArray(obj)) {
    return obj.length === 0;
  }
  else {
    for (var k in obj)
      return false;
    return true;
  }
}

// ============================================================================
// [xui.ClassRegistry]
// ============================================================================

// Maps a class-name into a class constructor.
const ClassRegistry = new (xmo({
  constructor() {
    this.$map = $dict();
  },

  get(name) {
    const map = this.$map;
    return hasOwn.call(map, name) ? map[name] : null;
  },

  add(names, Class) {
    const map = this.$map;

    if (isArray(names)) {
      for (var i = 0; i < names.length; i++) {
        const key = names[i];

        if (hasOwn.call(map, key))
          throw new TypeError(`Class '${key}' already registered`);
        map[key] = Class;
      }
    }
    else {
      const key = names;
      if (hasOwn.call(map, key))
        throw new TypeError(`Class '${key}' already registered`);
      map[key] = Class;
    }

    return this;
  },

  remove(names) {
    const map = this.$map;

    if (isArray(names)) {
      for (var i = 0; i < names.length; i++) {
        const key = names[i];
        delete map[key];
      }
    }
    else {
      const key = names;
      delete map[key];
    }

    return this;
  }
}));
xui.ClassRegistry = ClassRegistry;

// ============================================================================
// [xui.Class]
// ============================================================================

function $$FixedProperty(member, property) {
  return function(value) {
    const prev = this[member];
    if (prev !== value)
      throw new Error(`Property '${property}' cannot be set to '${value}'`);
    return this;
  }
}

const Mixin = (function() {
  function $$MakeGetterFunc(Class, property) {
    const name = property.name;
    const field = `$${name}`;

    return new Function(`return this.${field};`);
  }

  function $$MakeSetterFunc(Class, property) {
    const proto = Class.prototype;

    const name = property.name;
    const field = `$${name}`;

    var body = "";
    var condition = "";

    switch (`${proto.$classType}.${property.domain}`) {
      case "layout.css":
        condition = `if (this.$component) `;
        break;
    }

    if (!body) {
      body = `const prev = this.${field};\n` +
             `if (prev !== value) {\n` +
             `  this.${field} = value;\n` +
             `  ${condition}this.$update${firstUpper(name)}(value, prev);\n` +
             `}\n` +
             `return this;\n`;
    }

    return new Function("value", body);
  }

  function $$DummyUpdate(value, old) {}

  function $$LayoutUpdate(Class, property) {
    const cssName = property.cssName || property.name;
    const cssFunc = property.cssFunc || String;

    return function(value, old) {
      this.$component.$element.style[cssName] = cssFunc(value);
    }
  }

  function $$MakeUpdateFunc(Class, property) {
    const proto = Class.prototype;

    switch (`${proto.$classType}.${property.domain}`) {
      case "layout.css":
        return $$LayoutUpdate(Class, property);
    }

    return $$DummyUpdate;
  }

  function $$HandlePropertyDefs(Class, definedProperties) {
    if (isEmpty(definedProperties))
      return;

    const proto = Class.prototype;
    const metaProperties = Class.$metaInfo.getMutable("properties");

    for (var name in definedProperties) {
      const def = definedProperties[name];
      const existing = metaProperties[name];

      var property = null;

      if (!existing) {
        if (def.override)
          throwError(`Property '${name}' isn't overridden, but specifies 'override'`);

        const upperName = firstUpper(name)
        const type = def.type || "";
        const domain = def.domain || "";
        const readOnly = !!def.readOnly;

        var getterName  = `get${upperName}`;
        var setterName  = !readOnly ? `set${upperName}`     : null;
        var updaterName = !readOnly ? `$update${upperName}` : null;

        property = $dict({
          name       : name,
          type       : type,
          domain     : domain,
          readOnly   : readOnly,
          upperName  : upperName,
          getterName : getterName,
          setterName : setterName
        });

        Object.assign(property, def);
        metaProperties[name] = property;

        if (!proto[getterName])
          proto[getterName] = $$MakeGetterFunc(Class, property);

        if (setterName) {
          if (!proto[setterName]) {
            proto[setterName] = $$MakeSetterFunc(Class, property);
          }

          if (!proto[updaterName])
            proto[updaterName] = $$MakeUpdateFunc(Class, property);
        }
      }
      else {
        // Existing property, may just redefine defaults and stuff.
        property = $dict(existing);
        for (var k in def)
          if (k !== "override")
            property[k] = def[k];
        metaProperties[name] = property;
      }
    }
  }

  return xmo.mixin({
    $preInit(def, mixins) {
      const metaInfo = this.$metaInfo;
      if (!metaInfo.properties)
        metaInfo.properties = $dict();
    },

    $postInit(def, mixins) {
      const metaInfo = this.$metaInfo;

      // Class type.
      const proto = this.prototype;
      proto.$classType = proto.$classType || "class";

      // Process `$properties` definitions and do the following:
      //   1. Maintain `Class.$metaInfo.properties` to contain all properties
      //      of the given class. Inherited properties are copied as well.
      //   2. Create getters and setters for properties that don't have one.
      //      Also in case of special properties it can also create updaters.
      if (mixins) {
        for (var i = 0; i < mixins.length; i++) {
          const mixin = mixins[i];
          const mMeta = mixin.$metaInfo;
          if (mMeta.properties)
            $$HandlePropertyDefs(this, mixin.properties);
        }
      }

      if (def.$properties) {
        $$HandlePropertyDefs(this, def.$properties);
      }

      // Class name or names (name + aliases) is registered globally so it can
      // be used by UI builder (and layout builder, etc).
      const names = def.$name;
      if (names)
        ClassRegistry.add(names, this);
    },

    $extensions: {
      $name: null,
      $properties: null
    }
  });
})();
xui.Mixin = Mixin;

// Base class for most classes provided by `xui`.
const Class = (function() {
  return xmo({
    $mixins: [Mixin],

    constructor() {
      this.$listeners = $dict();
    },

    get(key) {
      if (typeof key === "string") {
        return this[key];
      }
      else {
        const properties = $dict();
        for (var k in key)
          properties[k] = this[`get${firstUpper(key)}`]();
        return properties;
      }
    },

    set(key, value) {
      if (typeof key === "string") {
        this[`set${firstUpper(key)}`](value);
      }
      else {
        const properties = key;
        for (var k in properties)
          this[`set${firstUpper(k)}`](properties[k]);
      }

      return this;
    },

    hasListener(name) {
      return hasOwn.call(this.$listeners, name);
    },

    addListener(name, listener, scope) {
      var arr = this.$listeners[name];
      if (!arr)
        arr = this.$listeners[name] = [];
      arr.push({ listener: listener, scope: scope });
    },

    removeListener(name, listener, scope) {
      var arr = this.$listeners[name];
      if (!arr) return false;

      for (var i = 0; i < arr.length; i++) {
        const obj = arr[i];
        if (obj.listener === listener && obj.scope === scope) {
          arr.remove(i);
          return true;
        }
      }

      return false;
    },

    dispatch(name, event) {
      var arr = this.$listeners[name];
      if (!arr) return false;

      for (var i = 0; i < arr.length; i++) {
        const obj = arr[i];
        obj.listener.call(obj.scope, event);
      }
    }
  });
})();
xui.Class = Class;

// ============================================================================
// [xui.BoxSide]
// ============================================================================

const BoxSide = freeze($enum({
  Top   : 0,
  Right : 1,
  Bottom: 2,
  Left  : 3
}));

// ============================================================================
// [xui.CheckState]
// ============================================================================

const CheckState = freeze($dict({
  False        : 0,
  True         : 1,
  Indeterminate: 2
}));
xui.CheckState = CheckState;

// ============================================================================
// [xui.LayoutFlags]
// ============================================================================

// Layout flags.
const LayoutFlags = freeze($enum({
  IsCustom             : 0x00000001  // Layout uses custom calculations (no-css).
}));

// ============================================================================
// [xui.ComponentFlags]
// ============================================================================

// Component flags.
//
// Component flags were created to decrease the memory requirements of per
// compoment. Many component's properties are of boolean type, which are stored
// as a single `$flags` member (integer). These properties are mostly internal
// or part of provided built-in components, and thus optimized this way.
//
// Don't use component's `$flags` for your own purposes when creating custom
// components. These are considered internal and may change without notice.
const ComponentFlags = freeze($enum({
  // Core flags - represent boolean property values that can be used freely by
  // all xui components, but not by user-defined components!
  CoreFlagsMask        : 0x0000FFFF,

  IsRoot               : 0x00000001, // Component is `xui.Root`.
  IsVisible            : 0x00000002, // Component is visible.
  IsScrollable         : 0x00000004, // Component is scrollable.
  IsInternal           : 0x00008000, // Component is internal.

  // Special flags are used to tag the component and add it to parent's
  // special components list. Special usually means that the component
  // requires additional handling related to layout and resizing.
  SpecialFlagsMask     : 0x00FF0000,

  HasCustomLayout      : 0x00010000, // Component has a custom (not css) layout manager.
  HasResizeHandler     : 0x00020000, // Component has a resize handler.

  Dirty                : 0x01000000, // Component is dirty.
  DirtyChildren        : 0x02000000, // Component has one or more child dirty.
  DirtyChildrenAll     : 0x04000000, // Component and all children are dirty.
//DirtyLayout          : 0x00400000, // Component has dirty layout.
  QueuedForUpdate      : 0x40000000  // Component is queued for update.
}));
xui.ComponentFlags = ComponentFlags;

// ============================================================================
// [xui.new]
// ============================================================================

xui.new = (function() {
  const $$SpecialProperties = $dict({
    as      : true,
    type    : true,
    layout  : true,
    children: true
  });

  function new_(opt, scope) {
    if (isArray(opt)) {
      const array = opt;
      const result = [];

      for (var i = 0; i < array.length; i++)
        result.push(new_(array[i], scope));

      return result;
    }
    else {
      if (typeof opt !== "object" || opt == null)
        throwError("Definition must be object or array");

      const type = opt.type || "container";
      const Class = ClassRegistry.get(type);

      if (!Class)
        throwError(`Component '${type}' doesn't exist`);

      var component = null;

      // Handle the case when `type` is not component but layout. In that
      // case it's a shortcut to `{ type: "container", layout: ... }`.
      if (Class.prototype instanceof Layout) {
        if (hasOwn.call(opt, "layout"))
          throwError("Component type cannot be set to a layout-type and contain 'layout' at the same time");

        component = new xui.Container();
        component.setLayout(new Class());
      }
      else {
        component = new Class();

        const layout = opt.layout;
        if (layout) {
          if (typeof component.setLayout !== "function")
            throwError("Component '${type}' is not a container that supports 'layout'");

          component.setLayout(layout);
        }
      }

      if (scope && opt.as)
        scope[opt.as] = component;

      if (!scope)
        scope = component;

      for (var k in opt) {
        if ($$SpecialProperties[k])
          continue;
        component.set(k, opt[k]);
      }

      if (opt.children) {
        const children = new_(opt.children, scope);
        if (isArray(children)) {
          for (var i = 0; i < children.length; i++)
            component.append(children[i]);
        }
        else {
          component.append(children);
        }
      }

      return component;
    }
  }

  return new_;
})();

// ============================================================================
// [xui.dom]
// ============================================================================

const dom = $dict();
xui.dom = dom;

function numberToPx(value) {
  return value === null ? "" : String(value) + "px";
}
dom.numberToPx = numberToPx;

function DOM$CreateEventHandler(name, info) {
  return Function("xui",
  `
  return function(event) {
    const target = event.target;
    if (target) {
      var component = xui.dom.componentByElement(target);
      while (component) {
        if (component.$on${info.func})
          component.$on${info.func}(event);
        component.dispatch("${name}", event);
        component = component.$parent;
      }
    }
  };`)(xui);
}

function DOM$AttachEventHandlers(object, element, prefix, events) {
  for (var name in events) {
    const info = events[name];
    const func = object[`${prefix}${info.func}`];

    element.addEventListener(name, func, true);
  }
}

function DOM$DetachEventHandlers(object, element, prefix, events) {
  for (var name in events) {
    const info = events[name];
    const func = object[`${prefix}${info.func}`];

    element.removeEventListener(name, func, true);
  }
}

// Get the closest component that contains `element`, even nested.
function DOM$ComponentByElement(element) {
  var component = element.$xui;
  while (!component) {
    element = element.parentNode;
    if (!element) return null;
    component = element.$xui;
  }
  return component;
}
dom.componentByElement = DOM$ComponentByElement;

const XUI$WindowEvents = {
  "resize"            : { func: "Resize"             },
  "online"            : { func: "Online"             },
  "offline"           : { func: "Offline"            },
  "message"           : { func: "Message"            },
  "hashchange"        : { func: "HashChange"         }
};

const XUI$DocumentEvents = {
  "fullscreenchange"  : { func: "FullscreenChange"   },
  "fullscreenerror"   : { func: "FullscreenError"    }
};

const XUI$ElementEvents = {
  "animationstart"    : { func: "AnimationStart"     },
  "animationend"      : { func: "AnimationEnd"       },
  "animationiteration": { func: "AnimationIteration" },

  "transitionstart"   : { func: "TransitionStart"    },
  "transitioncancel"  : { func: "TransitionCancel"   },
  "transitionend"     : { func: "TransitionEnd"      },
  "transitionrun"     : { func: "TransitionRun"      },

  "keydown"           : { func: "KeyDown"            },
  "keyup"             : { func: "KeyUp"              },
  "keypress"          : { func: "KeyPress"           },

  "mouseenter"        : { func: "MouseEnter"         },
  "mouseleave"        : { func: "MouseLeave"         },
  "mouseout"          : { func: "MouseOut"           },
  "mouseover"         : { func: "MouseOver"          },
  "mousemove"         : { func: "MouseMove"          },
  "mousedown"         : { func: "MouseDown"          },
  "mouseup"           : { func: "MouseUp"            },
  "wheel"             : { func: "Wheel"              },

  "click"             : { func: "Click"              },
  "auxclick"          : { func: "AuxClick"           },
  "dblclick"          : { func: "DblClick"           },

  "select"            : { func: "Select"             },
  "pointerlockchange" : { func: "PointerLockChange"  },
  "pointerlockerror"  : { func: "PointerLockError"   },

  "contextmenu"       : { func: "ContextMenu"        },

  "focus"             : { func: "Focus"              },
  "blur"              : { func: "Blur"               },

  "reset"             : { func: "Reset"              },
  "submit"            : { func: "Submit"             },
  "change"            : { func: "Change"             },

  "scroll"            : { func: "Scroll"             },
  "cut"               : { func: "Cut"                },
  "copy"              : { func: "Copy"               },
  "paste"             : { func: "Paste"              }
};

// ============================================================================
// [xui.Global]
// ============================================================================

const Global = new (xmo({
  constructor() {
    this.$document = document;
    this.$window = window;
    this.$attachEventHandlers();
  },

  _createEventHandlers() {
    for (var name in XUI$DocumentEvents) {
      const info = XUI$DocumentEvents[name];
      const func = Function("event",
        `this.dispatch("${name}", event);`
      ).bind(this);
      this[`_handle${info.func}`] = func;
    }

    for (var name in XUI$WindowEvents) {
      const info = XUI$WindowEvents[name];
      const func = Function("event",
        `this.dispatch("${name}", event);`
      ).bind(this);
      this[`_handle${info.func}`] = func;
    }
  },

  $attachEventHandlers() {
    DOM$AttachEventHandlers(this, this.$window  , "_handle", XUI$WindowEvents);
    DOM$AttachEventHandlers(this, this.$document, "_handle", XUI$DocumentEvents);
  },

  $detachEventHandlers() {
    DOM$DetachEventHandlers(this, this.$window  , "_handle", XUI$WindowEvents);
    DOM$DetachEventHandlers(this, this.$document, "_handle", XUI$DocumentEvents);
  }
}));
xui.Global = Global;

// ============================================================================
// [xui.UpdateRegistry]
// ============================================================================

// Contains a list of components to be updated.
const UpdateRegistry = new (xmo({
  constructor() {
    this.$timerId = null;
    this.$components = [];
  },

  add(component) {
    var flags = component.$flags;
    if (flags & ComponentFlags.QueuedForUpdate)
      return;

    component.$flags = flags | ComponentFlags.QueuedForUpdate;
    this.$components.push(component);

    if (this.$timerId === null)
      this.$postWork();

    return this;
  },

  $postWork() {
    this.$timerId = setImmediate(this.$onWork, this);
  },

  $onWork(self) {
    const components = this.$components;
    self.$timerId = null;
    self.$components = [];
    self.onUpdate(components);
  },

  onUpdate(components) {
    for (var i = 0; i < components.length; i++) {
      const component = components[i];

      component.$flags &= ~(ComponentFlags.QueuedForUpdate)
      if (!component.isAttached())
        continue;

      component.$update();
    }
  }
}));
xui.UpdateRegistry = UpdateRegistry;

// ============================================================================
// [xui.Layout]
// ============================================================================

function Layout$newUpdateLayout(Class) {
  const metaProperties = Class.$metaInfo.properties;
  var body = "";

  for (var k in metaProperties) {
    const metaProperty = metaProperties[k];
    if (metaProperty.domain !== "css")
      continue;
    body += `this.$update${metaProperty.upperName}(this.$${metaProperty.name});\n`;
  }

  return Function(body);
}

const Layout = xmo({
  $extend: Class,
  $classType: "layout",

  $properties: {
    type: { type: "string", init: "" }
  },

  constructor(opt) {
    Class.call(this);

    this.$type = "";
    this.$flags = 0;
    this.$class = "";
    this.$component = null;

    if (opt) this.set(opt);
  },

  $postInit(def) {
    const proto = this.prototype;
    proto.$updateLayout = Layout$newUpdateLayout(this);
  },

  getType() { return this.$type; },
  setType: $$FixedProperty("$type", "type"),

  isCustom() { return (this.$flags & LayoutFlags.IsCustom) !== 0; },
  isAttached() { return this.$component !== null; },

  getComponent() { return this.$component; },

  $attach(component) {
    if (this.$component)
      throwError(`The '${this.$type}' layout is already attached to a component`);

    if (!component.$element)
      throwError(`The '${this.$type}' layout can only be attached to a component with existing DOM element`);

    component.$layout = this;
    this.$component = component;

    component.addClass(this.$class);
    this.$onAttachLayout(this);
    this.$attachAllChildren(true);
  },

  $detach() {
    const component = this.$component;
    if (!component) return;

    this.$detachAllChildren(true);

    component.removeClass(this.$class);
    component.$layout = null;

    this.$component = null;
    this.$$onDetachLayout(component);
  },

  $attachAllChildren(isLayoutAttach) {
    if (!this.$component)
      return;

    const children = this.$component.$children;
    for (var i = 0; i < children.length; i++)
      this.$onAttachChild(children[i], i, isLayoutAttach);
  },

  $detachAllChildren(isLayoutDetach) {
    if (!this.$component)
      return;

    const children = this.$component.$children;
    for (var i = 0; i < children.length; i++)
      this.$onDetachChild(children[i], i, isLayoutDetach);
  },

  $getClass() {
    return this.$class;
  },

  $setClass(value) {
    const prev = this.$class;
    this.$class = value;

    this._switchClass(value, prev);
    return this;
  },

  _switchClass(value, prev) {
    const component = this.$component;
    if (component) component.switchClass(value, prev);
  },

  _resetLayout() {},

  $onAttachLayout(component) { this.$updateLayout(); },
  $$onDetachLayout(component) { this._resetLayout(); },

  $onAttachChild(child, index, isLayoutAttach) {},
  $onDetachChild(child, index, isLayoutDetach) {}
});
xui.Layout = Layout;

// ============================================================================
// [xui.CssLayout]
// ============================================================================

const CssLayout = xmo({
  $extend: Layout,

  $properties: {
    type : { override: true, init: "css" },
    class: { type: "string", init: ""    }
  },

  constructor(opt) {
    Layout.call(this);

    this.$type = "css";
    this.$class = "";

    if (opt) this.set(opt);
  },

  getClass: Layout.prototype.$getClass,
  setClass: Layout.prototype.$setClass
});
xui.CssLayout = CssLayout;

// ============================================================================
// [xui.FitLayout]
// ============================================================================

const FitLayout = xmo({
  $extend: Layout,

  $name: ["xui.FitLayout", "fit"],

  $properties: {
  },

  constructor(opt) {
    Layout.call(this);

    this.$type = "fit";
    this.$class = "xui-fit";

    if (opt) this.set(opt);
  },

  _resetLayout() {}
});
xui.FitLayout = FitLayout;

// ============================================================================
// [xui.BoxLayout]
// ============================================================================

const $$TranslateFlexValue = freeze($dict({
  ""             : "",
  "start"        : "flex-start",
  "end"          : "flex-end",
  "space-around" : "space-around",
  "space-between": "space-between",
  "center"       : "center",
  "stretch"      : "stretch",
  "baseline"     : "baseline"
}));

const BoxLayout$Justify = freeze($dict([
  "start", "end", "center", "space-between", "space-around"
]));

const BoxLayout$Alignment = freeze($dict([
  "start", "end", "center", "stretch", "baseline"
]));

const BoxLayout = xmo({
  $extend: Layout,

  $name: ["xui.BoxLayout", "hbox", "vbox"],

  $properties: {
    gap       : { type: "number", domain: "css", init: 0 },
    justify   : { type: "string", domain: "css", init: "start", restrict: BoxLayout$Justify },
    alignment : { type: "string", domain: "css", init: "start", restrict: BoxLayout$Alignment }
  },

  constructor(opt) {
    Layout.call(this);

    // No update necessary as there is no component attached at this point.
    this.$type = "hbox";
    this.$class = "xui-hbox";

    this.$gap = 0;
    this.$gapCssStyle = "marginLeft";

    this.$justify = "start";
    this.$alignment = "start";

    if (opt) this.set(opt);
  },

  setType(value) {
    if (this.$type === value)
      return;

    this.$type = value;
    this.$setClass(`xui-${value}`);
    this.$updateGapCssProperty();
  },

  $updateGapCssProperty() {
    const gap = this.$gap;
    const prev = this.$gapCssStyle;

    if (gap !== 0)
      this.$detachAllChildren(false);

    this.$gapCssStyle = this.$type === "vbox" ? "marginTop" : "marginLeft";

    if (gap !== 0)
      this.$attachAllChildren(false);
  },

  $updateGap(gap) {

  },

  $updateJustify(justify) {
    this.$component.$element.style.justifyContent = $$TranslateFlexValue[justify];
  },

  $updateAlignment(alignment) {
    this.$component.$element.style.alignItems = $$TranslateFlexValue[alignment];
  },

  _resetLayout() {
    this.$updateJustify("");
    this.$updateAlignment("");
  },

  $updateChildrenGaps() {
    if (!this.$component)
      return;

    const children = this.$component.children;
    const cssStyle = this.$gapCssStyle;
    const cssValue = numberToPx(this.$gap || null);

    for (var i = 1; i < children.length; i++)
      children[i].style[cssStyle] = cssValue;
  },

  $onAttachChild(child, index, layoutAttach) {
    if (this.$gap !== 0) {
      const children = this.$component.$children;

      const cssStyle = this.$gapCssStyle;
      const cssValue = numberToPx(this.$gap);

      if (index !== 0)
        child.$element.style[cssStyle] = cssValue;
      else if (children.length > 1)
        children[1].style[cssStyle] = cssValue;
    }
  },

  $onDetachChild(child, index, layoutDetach) {
    if (this.$gap !== 0) {
      const children = this.$component.$children;
      const cssStyle = this.$gapCssStyle;

      child.$element.style[cssStyle] = "";
      if (children.length)
        children[0].style[cssStyle] = "";
    }
  }
});
xui.BoxLayout = BoxLayout;

// ============================================================================
// [xui.GridLayout]
// ============================================================================

const $$TranslateGridValue = freeze({
  ""             : "",
  "start"        : "flex-start",
  "end"          : "flex-end",
  "space-around" : "space-around",
  "space-between": "space-between",
  "center"       : "center",
  "stretch"      : "stretch",
  "baseline"     : "baseline"
});

const GridLayout$Justify = freeze($dict([
  "start", "end", "center", "space-between", "space-around"
]));

const GridLayout$Alignment = freeze($dict([
  "start", "end", "center", "stretch", "baseline"
]));

function GridLayout$columnCount(value) {
  return value ? `repeat(${value}, auto)` : ``;
}

const GridLayout = xmo({
  $extend: Layout,

  $name: ["xui.GridLayout", "grid"],

  $properties: {
    justify    : { type: "string", domain: "css", init: "start", restrict: GridLayout$Justify },
    alignment  : { type: "string", domain: "css", init: "start", restrict: GridLayout$Alignment },

    rowGap     : { type: "number", domain: "css", init: 0, cssName: "gridRowGap"         , cssFunc: numberToPx },
    columnGap  : { type: "number", domain: "css", init: 0, cssName: "gridColumnGap"      , cssFunc: numberToPx },
    columnCount: { type: "number", domain: "css", init: 0, cssName: "gridTemplateColumns", cssFunc: GridLayout$columnCount }
  },

  constructor(opt) {
    Layout.call(this);

    // No update necessary as there is no component attached at this point.
    this.$type = "grid";
    this.$class = "xui-grid";

    this.$justify = "start";
    this.$alignment = "start";

    this.$rowGap = 0;
    this.$columnGap = 0;
    this.$columnCount = 0;

    if (opt) this.set(opt);
  },

  setType(value) {
    if (value !== "grid")
      throwError(`xui.GridLayout.type - Invalid value '${value}'`);
    return this;
  },

  $updateJustify(justify) {
    this.$component.$element.style.justifyContent = $$TranslateFlexValue[justify];
  },

  $updateAlignment(alignment) {
    this.$component.$element.style.alignItems = $$TranslateFlexValue[alignment];
  },

  _resetLayout() {
    this.$updateJustify("");
    this.$updateAlignment("");
  }
});
xui.GridLayout = GridLayout;

// ============================================================================
// [xui.Component]
// ============================================================================

const ComponentInitialFlags =
  ComponentFlags.IsVisible |
  ComponentFlags.Dirty |
  ComponentFlags.DirtyChildrenAll;

// Component (base class for all UI components).
const Component = xmo({
  $extend: Class,

  $name: ["xui.Component", "component"],
  $tagName: "div",
  $cssClass: "xui-div",

  $properties: {
    class            : { type: "string" , domain: "ui", init: ""    },
    visible          : { type: "bool"   , domain: "ui", init: true  },
    width            : { type: "number" , domain: "ui", init: null  },
    height           : { type: "number" , domain: "ui", init: null  },
    minWidth         : { type: "number" , domain: "ui", init: null  },
    minHeight        : { type: "number" , domain: "ui", init: null  },
    maxWidth         : { type: "number" , domain: "ui", init: null  },
    maxHeight        : { type: "number" , domain: "ui", init: null  },
    clientWidth      : { type: "number" , domain: "ui", readOnly: true },
    clientHeight     : { type: "number" , domain: "ui", readOnly: true },
    borderWidth      : { type: "array"  , domain: "ui", init: null, aggregate: "box" },
    borderWidthTop   : { type: "number" , domain: "ui", init: null  },
    borderWidthRight : { type: "number" , domain: "ui", init: null  },
    borderWidthBottom: { type: "number" , domain: "ui", init: null  },
    borderWidthLeft  : { type: "number" , domain: "ui", init: null  },
    padding          : { type: "array"  , domain: "ui", init: null, aggregate: "box" },
    paddingTop       : { type: "number" , domain: "ui", init: null  },
    paddingRight     : { type: "number" , domain: "ui", init: null  },
    paddingBottom    : { type: "number" , domain: "ui", init: null  },
    paddingLeft      : { type: "number" , domain: "ui", init: null  },
    tabIndex         : { type: "number" , domain: "ui", init: -1    },
    scrollable       : { type: "bool"   , domain: "ui", init: false },
    scrollTop        : { type: "number" , domain: "ui", init: 0     },
    scrollLeft       : { type: "number" , domain: "ui", init: 0     },
    scrollWidth      : { type: "number" , domain: "ui", readOnly: true },
    scrollHeight     : { type: "number" , domain: "ui", readOnly: true }
  },

  constructor(opt) {
    Class.call(this);

    this.$flags = ComponentInitialFlags;      // Component flags, see `ComponentFlags`.
    this.$element = null;                     // DOM element associated with this component.
    this.$container = this;                   // Container component (where children will be added).

    this.$parent = null;                      // Raw parent of the component.
    this.$children = [];                      // Children or raw children of the component.
    this.$specialChildren = [];               // Array of children components that are special.
    this.$cachedIndex = -1;                   // Cached index of parent's children[] array.

    this.$layout = null;                      // The layout that manages the component's [raw] children.
    this.$layoutItemData = $dict();           // Data used by the layout of the parent component.

    this.$class = "";                         // Custom CSS class of this component.

    this.$borderWidth = [null, null, null, null]; // CSS border-width property.
    this.$padding     = [null, null, null, null]; // CSS padding property.

    this.$createElement();
    if (opt) this.set(opt);
  },

  // --------------------------------------------------------------------------
  // [DOM]
  // --------------------------------------------------------------------------

  getElement() {
    return this.$element;
  },

  $createElement() {
    const element = document.createElement(this.$tagName);

    // Initialize basics.
    element.className = this.$cssClass;

    // Connect DOM and XUI.
    element.$xui = this;
    this.$element = element;
    this.$initElement(element);
  },

  $initElement(element) {
    // Can be reimplemented if the `element` requires some initialization, for
    // example by setting <input type=""> to something else than default value.
  },

  // --------------------------------------------------------------------------
  // [Component Flags]
  // --------------------------------------------------------------------------

  isInternal() {
    return (this.$flags & ComponentFlags.IsInternal) !== 0;
  },

  // --------------------------------------------------------------------------
  // [Component Hierarchy]
  // --------------------------------------------------------------------------

  getParent() {
    var component = this.$parent;
    if (component !== null && (component.$flags & ComponentFlags.IsInternal))
      component = component.$parent;
    return component;
  },

  getChildren() {
    return this.$children;
  },

  indexOfChild(child) {
    return this.$indexOfChild(child);
  },

  $indexOfChild(child) {
    if (!child)
      return -1;

    const children = this.$children;
    const cached = child.$cachedIndex;

    if (cached < children.length && children[cached] === child)
      return cached;

    const index = children.indexOf(child);
    child.$cachedIndex = index;
    return index;
  },

  childBounds(child) {
    return this.$container.$childBounds(child);
  },

  $childBounds(child) {
    const mainElement = this.$element;
    const childElement = child.$element;

    var x0 = childElement.offsetLeft - mainElement.offsetLeft;
    var y0 = childElement.offsetTop - mainElement.offsetTop;

    x0 += childElement.scrollLeft;
    y0 += childElement.scrollTop;

    var x1 = x0 + childElement.clientWidth;
    var y1 = y0 + childElement.clientHeight;

    return {
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
    };
  },

  childByElement(element) {
    return this.$childByElement(element);
  },

  $childByElement(element) {
    var component = dom.componentByElement(element);
    while (component) {
      if (component.$parent === this)
        return component;
      component = component.$parent;
    }
    return null;
  },

  childAtPoint(x, y) {
    return this.$childAtPoint(x, y);
  },

  $childAtPoint(x, y) {
    const containerRect = this.$element.getBoundingClientRect();
    const children = this.$children;

    if (x == null && y == null)
      return null;

    const sx = this.getScrollLeft();
    const sy = this.getScrollTop();

    // If `x` or `y` is null it means that we won't match that
    // coordinate. Useful for matching children of list views.
    const px0 = x == null ?  Infinity : x - sx;
    const py0 = y == null ?  Infinity : y - sy;
    const px1 = x == null ? -Infinity : x - sx;
    const py1 = y == null ? -Infinity : y - sy;


    // console.log(`Container: ${containerRect.x} ${containerRect.y} ${containerRect.width} ${containerRect.height}`);
    // console.log(`Point: ${x} ${y}`);

    // TODO: not optimal, there should be a better way
    //       of obtaining element from [x, y] position.
    for (var i = 0; i < children.length; i++) {
      const child = children[i];
      const element = child.$element;

      const elementRect = element.getBoundingClientRect();

      var cx0 = elementRect.x - containerRect.x;
      var cy0 = elementRect.y - containerRect.y;

      var cx1 = cx0 + elementRect.width;
      var cy1 = cy0 + elementRect.height;

      // console.log(`Child: ${cx0} ${cy0} ${cx1} ${cy1}`);

      if (px0 >= cx0 && py0 >= cy0 && px1 < cx1 && py1 < cy1)
        return child;
    }

    return null;
  },

  $append(/* ... */) {
    for (var i = 0; i < arguments.length; i++) {
      const arg = arguments[i];
      if (isArray(arg)) {
        const children = arg;
        for (var j = 0; j < children.length; j++)
          this.$appendChild(children[j]);
      }
      else {
        this.$appendChild(arg);
      }
    }

    return this;
  },

  $appendChild(child) {
    if (child.$parent !== null)
      throw new TypeError("Cannot append component that already has parent");

    const index = this.$children.length;
    child.$parent = this;

    this.$element.appendChild(child.$element);
    this.$children.push(child);

    // Make dirty.
    child.$flags |= ComponentFlags.DirtyChildrenAll;
    child.$makeHierarchyDirty();

    // Layout.
    const layout = this.$layout;
    if (layout)
      layout.$onAttachChild(child, index, false);
  },

  $prepend(/* ... */) {
    for (var i = 0; i < arguments.length; i++) {
      const arg = arguments[i];
      if (isArray(arg)) {
        const children = arg;
        for (var j = children.length - 1; j >= 0; j--)
          this.$prependChild(children[j]);
      }
      else {
        this.$prependChild(arg);
      }
    }

    return this;
  },

  $prependChild(child) {
    if (child.$parent !== null)
      throw new TypeError("Cannot prepend child that already has parent");

    this.$element.insertBefore(child.$element, this.$element.firstChild);
    this.$children.unshift(child);
    child.$parent = this;

    // Make dirty.
    child.$flags |= ComponentFlags.DirtyChildrenAll;
    child.$makeHierarchyDirty();

    // Layout.
    const layout = this.$layout;
    if (layout)
      layout.$onDetachChild(child, 0, false);
  },

  $remove(/* ... */) {
    const children = this.$children;

    for (var i = 0; i = arguments.length; i++) {
      const arg = arguments[i];
      if (isArray(arg)) {
        const arr = arg;
        var j = 0;
        while (j < arr.length) {
          const child = arr[j];
          const index = children.indexOf(child);
          if (index === -1)
            throwError("Invalid component passed to $remove()");

          var count = 1;
          while (++j < arr.length && children[index + count] === arr[j])
            count++;

          this.$removeAt(index, count);
        }
      }
      else {
        const index = children.indexOf(arg);
        if (index === -1)
          throwError("Invalid component passed to $remove()");
        return this.$removeAt(index);
      }
    }

    return this;
  },

  $removeAt(index, count) {
    if (count == null)
      count = 1;

    const removed = this.$children.splice(index, count);

    if (removed.length) {
      const layout = this.$layout;
      const element = this.$element;

      for (var i = 0; i < removed.length; i++) {
        const child = removed[i];

        child.$parent = null;
        child.$flags |= ComponentFlags.DirtyChildrenAll;
        element.removeChild(child.$element);

        if (layout)
          layout.$onDetachChild(child, i, false);
      }
      this.$makeDirty(ComponentFlags.DirtyChildren);
    }
  },

  // --------------------------------------------------------------------------
  // [Visibility]
  // --------------------------------------------------------------------------

  show() { this.setVisible(true); },
  hide() { this.setVisible(false); },

  getVisible() {
    return !!(this.$flags & ComponentFlags.IsVisible);
  },

  setVisible(value) {
    const prev = this.getVisible();
    if (prev === value)
      return;

    if (value) {
      this.$flags = this.$flags | ComponentFlags.IsVisible;
      this.$element.style.display = "";
    }
    else {
      this.$flags = this.$flags & ~ComponentFlags.IsVisible;
      this.$element.style.display = "none";
    }
  },

  // --------------------------------------------------------------------------
  // [Size]
  // --------------------------------------------------------------------------

  $updateWidth(value) {
    this.$element.style.width = numberToPx(value);
  },

  $updateHeight(value) {
    this.$element.style.height = numberToPx(value);
  },

  $updateMinWidth(value) {
    this.$element.style.minWidth = numberToPx(value);
  },

  $updateMinHeight(value) {
    this.$element.style.minHeight = numberToPx(value);
  },

  $updateMaxWidth(value) {
    this.$element.style.maxWidth = numberToPx(value);
  },

  $updateMaxHeight(value) {
    this.$element.style.maxHeight = numberToPx(value);
  },

  getClientWidth() { return this.$element.clientWidth; },
  getClientHeight() { return this.$element.clientHeight; },

  // --------------------------------------------------------------------------
  // [Padding]
  // --------------------------------------------------------------------------

  getPadding() { return this.$padding; },
  setPadding(value) { this.$setPaddingInternal(value, -1); },

  getPaddingTop() { return this.$padding[BoxSide.Top]; },
  setPaddingTop(value) { this.$setPaddingInternal(value, BoxSide.Top); },

  getPaddingRight() { return this.$padding[BoxSide.Right]; },
  setPaddingRight(value) { this.$setPaddingInternal(value, BoxSide.Right); },

  getPaddingBottom() { return this.$padding[BoxSide.Bottom]; },
  setPaddingBottom(value) { this.$setPaddingInternal(value, BoxSide.Bottom); },

  getPaddingLeft() { return this.$padding[BoxSide.Left]; },
  setPaddingLeft(value) { this.$setPaddingInternal(value, BoxSide.Left); },

  $setPaddingInternal(padding, side) {
    const changed = this.$setBoxProperty("padding", this.$padding, side, padding);
    if (!changed) return;

    const style = this.$element.style
    if (changed & 0x1) style.paddingTop    = numberToPx(this.$padding[0]);
    if (changed & 0x2) style.paddingRight  = numberToPx(this.$padding[1]);
    if (changed & 0x4) style.paddingBottom = numberToPx(this.$padding[2]);
    if (changed & 0x8) style.paddingLeft   = numberToPx(this.$padding[3]);
  },

  // --------------------------------------------------------------------------
  // [CSS Styling]
  // --------------------------------------------------------------------------

  setClass(value) {
    const prev = this.$class;
    if (prev !== value) {
      this.$class = value;
      this.switchClass(value, prev);
    }
    return this;
  },

  hasClass(cssClass) {
    return this.$element.classList.contains(cssClass);
  },

  addClass(cssClass) {
    this.$element.classList.add(cssClass);
    return this;
  },

  removeClass(cssClass) {
    this.$element.classList.remove(cssClass);
    return this;
  },

  forceClass(cssClass, force) {
    this.$element.classList.toggle(cssClass, force);
    return this;
  },

  switchClass(set, del) {
    if (set !== del) {
      const classList = this.$element.classList;
      if (del) classList.remove(del);
      if (set) classList.add(set);
    }
    return this;
  },

  getBorderWidth() { return this.$borderWidth; },
  setBorderWidth(value) { this.$setBorderWidthInternal(value, -1); },

  getBorderWidthTop() { return this.$borderWidth[BoxSide.Top]; },
  setBorderWidthTop(value) { this.$setBorderWidthInternal(value, BoxSide.Top); },

  getBorderWidthRight() { return this.$borderWidth[BoxSide.Right]; },
  setBorderWidthRight(value) { this.$setBorderWidthInternal(value, BoxSide.Right); },

  getBorderWidthBottom() { return this.$borderWidth[BoxSide.Bottom]; },
  setBorderWidthBottom(value) { this.$setBorderWidthInternal(value, BoxSide.Bottom); },

  getBorderWidthLeft() { return this.$borderWidth[BoxSide.Left]; },
  setBorderWidthLeft(value) { this.$setBorderWidthInternal(value, BoxSide.Left); },

  $setBorderWidthInternal(value, side) {
    const changed = this.$setBoxProperty("borderWidth", this.$borderWidth, side, value);
    if (!changed) return;

    const style = this.$element.style
    if (changed & 0x1) style.borderWidthTop    = numberToPx(this.$borderWidth[0]);
    if (changed & 0x2) style.borderWidthRight  = numberToPx(this.$borderWidth[1]);
    if (changed & 0x4) style.borderWidthBottom = numberToPx(this.$borderWidth[2]);
    if (changed & 0x8) style.borderWidthLeft   = numberToPx(this.$borderWidth[3]);
  },

  // --------------------------------------------------------------------------
  // [Helpers]
  // --------------------------------------------------------------------------

  $setBoxProperty(name, dst, side, value) {
    if (side !== -1) {
      if (!isNumberOrNull(value))
        throwError(`Invalid '${name}${BoxSide.$index.get(side)}' property value '${value}'`);

      const changed = Number(dst[side] !== value) << side;
      dst[side] = value;
      return changed;
    }

    var top = null;
    var right = null;
    var bottom = null;
    var left = null;

    if (Array.isArray(value)) {
      const arr = value;

      switch (arr.length) {
        case 0:
          break;
        case 1:
          top = right = bottom = left = arr[0];
          break;
        case 2:
          top = bottom = arr[0];
          right = left = arr[1];
          break;
        case 4:
          top = arr[0];
          right = arr[1];
          bottom = arr[2];
          left = arr[3];
          break;
        default:
          throwError(`Invalid '${name}' property value '[${value.join(", ")}]'`);
      }

      if (!isNumberOrNull(top))
        throwError(`Invalid '${name}Top' property value '${top}'`);

      if (!isNumberOrNull(right))
        throwError(`Invalid '${name}Right' property value '${right}'`);

      if (!isNumberOrNull(bottom))
        throwError(`Invalid '${name}Bottom' property value '${bottom}'`);

      if (!isNumberOrNull(left))
        throwError(`Invalid '${name}Left' property value '${left}'`);
    }
    else if (isNumberOrNull(value)) {
      top = right = bottom = left = value;
    }
    else {
      throwError(`Invalid '${name}' property value '${value}'`);
    }

    const changed = (Number(dst[0] !== top   )     ) |
                    (Number(dst[1] !== right ) << 1) |
                    (Number(dst[2] !== bottom) << 2) |
                    (Number(dst[3] !== left  ) << 3) ;

    dst[0] = top;
    dst[1] = right;
    dst[2] = bottom;
    dst[3] = left;

    return changed;
  },

  // --------------------------------------------------------------------------
  // [Layout & LayoutItem]
  // --------------------------------------------------------------------------

  getInternalLayout() {
    return this.$layout;
  },

  $getLayout() {
    return this.$layout;
  },

  $setLayout(layout) {
    var type = "";
    var opt = null;

    const current = this.$layout;

    if (typeof layout === "object") {
      if (layout instanceof Layout) {
        // This is an existing `Layout` instance, so just use it.
        if (current)
          current.$detach();
        layout.$attach(this);
        return this;
      }
      else {
        type = layout.type;
        opt = layout;
      }
    }
    else if (typeof layout === "string") {
      type = layout;
    }

    if (!current || current.getType() !== type) {
      const Class = ClassRegistry.get(type);

      if (!Class || !(Class.prototype instanceof Layout))
        throwError(`Layout '${type}' doesn't exist`);

      const layout = new Class(opt);
      if (!opt) layout.setType(type);

      if (current)
        current.$detach();
      layout.$attach(this);
    }
    else {
      current.set(opt);
    }
  },

  getLayoutData() {
    return this.$layoutData;
  },

  // --------------------------------------------------------------------------
  // [Focus Handling & Tab-Index]
  // --------------------------------------------------------------------------

  getTabIndex() {
    return this._$element.tabIndex;
  },

  setTabIndex(value) {
    this.$element.tabIndex = value;
  },

  // --------------------------------------------------------------------------
  // [Scroll Area]
  // --------------------------------------------------------------------------

  getScrollable() {
    return this.$getScrollable();
  },

  setScrollable(value) {
    return this.$setScrollable(value);
  },

  $getScrollable() {
    return (this.$flags & ComponentFlags.IsScrollable) !== 0;
  },

  $setScrollable(value) {
    const flags = this.$flags;
    const style = this.$element.style;

    if (value) {
      this.$flags = flags | ComponentFlags.IsScrollable;
      style.display = "";
      style.overflow = value ? "auto" : "";
    }
    else {
      this.$flags = flags & ~ComponentFlags.IsScrollable;
      style.display = "none";
      style.overflow = value ? "auto" : "";
    }
  },

  getScrollLeft() { return this.$getScrollLeft(); },
  getScrollTop() { return this.$getScrollTop(); },

  setScrollLeft(value) { return this.$setScrollLeft(value); },
  setScrollTop(value) { return this.$setScrollTop(value); },

  getScrollWidth() { return this.$getScrollWidth(); },
  getScrollHeight() { return this.$getScrollHeight(); },

  $getScrollLeft() { return this.$element.scrollLeft; },
  $getScrollTop() { return this.$element.scrollTop; },

  $setScrollLeft(value) { this.$element.scrollLeft = value; },
  $setScrollTop(value) { this.$element.scrollTop = value; },

  $getScrollWidth() { return this.$element.scrollWidth; },
  $getScrollHeight() { return this.$element.scrollHeight; },

  // --------------------------------------------------------------------------
  // [Component Update]
  // --------------------------------------------------------------------------

  $update() {
  },

  $makeDirty(dirtyFlags) {
    /*
    const currentFlags = this.$flags;
    if ((currentFlags & dirtyFlags) === dirtyFlags)
      return;

    this.$flags |= dirtyFlags;
    this.$makeDirtyInHierarchy();
    */
  },

  $makeHierarchyDirty() {
    /*
    // Go ascending in hierarchy and update flags of all parent components.
    var parent = this.$parent;
    var component = this;

    while (parent !== null) {
      const parentFlags = component.$flags;
      if (parentFlags & ComponentFlags.DirtyChildrenAll)
        break;

      parent.$flags |= ComponentFlags.DirtyChildren;
      parent.$dirtyChildren.push(component);

      component = parent;
      parent = parent.$parent;
    }

    if (component.$flags & ComponentFlags.IsRoot)
      UpdateRegistry.add(parent);
    */
  }
});
xui.Component = Component;

// ============================================================================
// [xui.Container]
// ============================================================================

// Container component.
const Container = xmo({
  $extend: Component,

  $name: ["xui.Container", "container"],
  $tagName: "div",
  $cssClass: "xui-div",

  $properties: {
  },

  constructor(opt) {
    Component.call(this);
    if (opt) this.set(opt);
  },

  // --------------------------------------------------------------------------
  // [Component Hierarchy]
  // --------------------------------------------------------------------------

  append  : Component.prototype.$append,
  prepend : Component.prototype.$prepend,
  remove  : Component.prototype.$remove,
  removeAt: Component.prototype.$removeAt,

  // --------------------------------------------------------------------------
  // [Layout & Layout Item]
  // --------------------------------------------------------------------------

  getLayout: Component.prototype.$getLayout,
  setLayout: Component.prototype.$setLayout
});
xui.Container = Container;

// ============================================================================
// [xui.Composite]
// ============================================================================

const Composite = xmo({
  $extend: Container,

  $name: ["xui.Composite"],

  constructor(opt) {
    Component.call(this);
    this.$initContainer();
    if (opt) this.set(opt);
  },

  $initContainer() {
    this.$container = new Container();
    this.$setLayout({ type: "fit" });
    this.$append(this.$container);
  },

  // --------------------------------------------------------------------------
  // [Component Hierarchy]
  // --------------------------------------------------------------------------

  getChildren() {
    return this.$container.$children;
  },

  indexOfChild(child) {
    return this.$container.$indexOfChild(child);
  },

  childAtPoint(x, y) {
    return this.$container.$childAtPoint(x, y);
  },

  childByElement(element) {
    return this.$container.$childByElement(element);
  },

  prepend(/* ... */) {
    this.$container.$prepend.apply(this.$container, arguments);
    return this;
  },

  append(/* ... */) {
    this.$container.$append.apply(this.$container, arguments);
    return this;
  },

  remove(/* ... */) {
    this.$container.$remove.apply(this.$container, arguments);
    return this;
  },

  removeAt(index, count) {
    this.$container.$removeAt(index, count);
    return this;
  },

  // --------------------------------------------------------------------------
  // [Size]
  // --------------------------------------------------------------------------

  getClientWidth() { return this.$container.$element.clientWidth; },
  getClientHeight() { return this.$container.$element.clientHeight; },

  // --------------------------------------------------------------------------
  // [Padding]
  // --------------------------------------------------------------------------

  getPadding() { return this.$container.getPadding(); },
  setPadding(value) { this.$container.setPadding(value); },

  getPaddingTop() { return this.$container.getPaddingTop(); },
  setPaddingTop(value) { this.$container.setPaddingTop(value); },

  getPaddingRight() { return this.$container.getPaddingRight(); },
  setPaddingRight(value) { this.$container.setPaddingRight(value); },

  getPaddingBottom() { return this.$container.getPaddingBottom(); },
  setPaddingBottom(value) { this.$container.setPaddingBottom(value); },

  getPaddingLeft() { return this.$container.getPaddingLeft(); },
  setPaddingLeft(value) { this.$container.setPaddingLeft(value); },

  // --------------------------------------------------------------------------
  // [Layout & LayoutItem]
  // --------------------------------------------------------------------------

  getLayout() { return this.$container.getLayout(); },
  setLayout(opt) { this.$container.setLayout(opt); },

  // --------------------------------------------------------------------------
  // [Scroll Area]
  // --------------------------------------------------------------------------

  getScrollable() { return this.$container.$getScrollable(); },
  setScrollable(value) { return this.$container.$setScrollable(value); },

  getScrollLeft() { return this.$container.$element.scrollLeft; },
  setScrollLeft(value) { return this.$container.$setScrollLeft(value); },

  getScrollTop() { return this.$container.$element.scrollTop; },
  setScrollTop(value) { return this.$container.$setScrollTop(value); },

  getScrollWidth() { return this.$container.$getScrollWidth(); },
  getScrollHeight() { return this.$container.$getScrollHeight(); },

});
xui.Composite = Composite;

// ============================================================================
// [xui.Splittable]
// ============================================================================

const Splittable = xmo({
  $extend: Composite,

  $name: ["xui.Splittable", "splittable"],

  $properties: {
  },

  constructor(opt) {
    Composite.call(this);
    if (opt) this.set(opt);
  },

  $initContainer() {
    this.$container = new Container();
  }
});
xui.Splittable = Splittable;

// ============================================================================
// [xui.Embed]
// ============================================================================

const Embed = xmo({
  $extend: Container,

  $name: ["xui.Embed", "embed"],
  $cssClass: "xui-embed",

  constructor(opt) {
    Container.call(this);

    this.$flags |= ComponentFlags.IsRoot;
    this._createEventHandlers();

    if (opt) this.set(opt);
  },

  isAttached() { return this._$element.parentNode !== null; },
  attachToBody() { return this.attachToDOM(document.body); },

  attachToDOM(dom) {
    const element = this.$element;
    if (element.parentNode)
      throwError("The 'Root' component is already attached to DOM");

    dom.appendChild(element);
    this.$attachEventHandlers();

    return this;
  },

  detachFromDOM() {
    const element = this.$element;
    if (!element) return this;

    const dom = this._$element.parentNode;
    if (dom === null) return this;

    this.$detachEventHandlers();
    dom.removeChild(element);

    return this;
  },

  _createEventHandlers() {
    for (var name in XUI$ElementEvents) {
      const info = XUI$ElementEvents[name];
      this[`_handle${info.func}`] = DOM$CreateEventHandler(name, info).bind(this);
    }
  },

  $attachEventHandlers() {
    DOM$AttachEventHandlers(this, this.$element, "_handle", XUI$ElementEvents);
  },

  $detachEventHandlers() {
    DOM$DetachEventHandlers(this, this.$element, "_handle", XUI$ElementEvents);
  }
});
xui.Embed = Embed;

// ============================================================================
// [xui.Root]
// ============================================================================

// Root container, injected to the DOM.
//
// Root container establishes a basic relationship between the DOM and XUI
// and it's required to place XUI components into DOM. If you are developing
// a single page application then you would need only one Root that will be
// attached directly to the document body. However, if you are using XUI in
// an existing web-site you can choose either `Root` or `Embed` component.
const Root = xmo({
  $extend: Embed,

  $name: ["xui.Root", "root"],
  $cssClass: "xui-root",

  constructor(opt) {
    Embed.call(this);
    if (opt) this.set(opt);
  }
});
xui.Root = Root;

// ============================================================================
// [xui.Text]
// ============================================================================

const Text = xmo({
  $extend: Component,

  $name: ["xui.Text", "text"],
  $cssClass: "xui-text",

  $properties: {
    text: { type: "string", domain: "ui", init: "" },
    html: { type: "string", domain: "ui", init: "" }
  },

  constructor(opt) {
    Component.call(this);
    if (opt) this.set(opt);
  },

  getText() { return this.$element.textContent; },
  setText(value) { this.$element.textContent = value; },

  getHtml() { return this.$element.innerHTML; },
  setHtml(value) { this.$element.innerHTML = value; }
});
xui.Text = Text;

// ============================================================================
// [xui.MLabel]
// ============================================================================

const MLabel = xmo.mixin({
  $mixins: [Mixin],

  $properties: {
    text       : { type: "string", domain: "ui", init: "" }
  },

  $initLabel() {
    this.$label = new Text();
  },

  getText() { return this.$label.getText(); },
  setText(value) { this.$label.setText(value); },

  getHtml() { return this.$label.getHtml(); },
  setHtml(value) { this.$label.setHtml(value); }
});
xui.MLabel = MLabel;

// ============================================================================
// [xui.BaseInput]
// ============================================================================

const BaseInput = xmo({
  $extend: Component,

  $name: ["xui.BaseInput"],
  $tagName: "input",

  $properties: {
    tabIndex: { override: true, init: 0 }
  },

  constructor(opt) {
    Component.call(this);
    if (opt) this.set(opt);
  },

  getValue() { return this.$element.value; },
  setValue(value) { this.$element.value = value; },

  getPlaceholder() { return this.$element.placeholder; },
  setPlaceholder(value) { this.$element.placeholder = value; }
});
xui.BaseInput = BaseInput;

// ============================================================================
// [xui.TextField]
// ============================================================================

const TextField = xmo({
  $extend: BaseInput,
  $name: ["xui.TextField", "textfield"],
  $cssClass: "xui-input",

  $properties: {
    value      : { type: "string", domain: "ui", init: "" },
    placeholder: { type: "string", domain: "ui", init: "" }
  },

  constructor(opt) {
    BaseInput.call(this);
    if (opt) this.set(opt);
  },

  $initElement(element) {
    element.type = "text";
  }
});
xui.TextField = TextField;

// ============================================================================
// [xui.CheckInput]
// ============================================================================

const CheckInput = xmo({
  $extend: BaseInput,

  $name: ["xui.CheckInput"],
  $cssClass: "xui-check",

  $properties: {
    value      : { type: "number", domain: "ui", init: CheckState.False }
  },

  constructor(opt) {
    BaseInput.call(this);
    if (opt) this.set(opt);
  },

  getValue(value) {
    const element = this.$element;
    if (element.indeterminate)
      return CheckState.Indeterminate;
    else
      return Number(element.checked);
  },

  setValue(value) {
    const element = this.$element;
    const state = Number(value);

    if (state === CheckState.Indeterminate) {
      element.checked = false;
      element.indeterminate = true;
    }
    else {
      element.checked = Boolean(state);
      element.indeterminate = false;
    }
  },

  $initElement(element) {
    element.type = "checkbox";
  }
});
xui.CheckInput = CheckInput;

// ============================================================================
// [xui.CheckBox]
// ============================================================================

const CheckBox = xmo({
  $extend: Component,
  $mixins: [MLabel],

  $name: ["xui.CheckBox", "checkbox"],

  $properties: {
    value      : { type: "number", domain: "ui", init: CheckState.False }
  },

  constructor(opt) {
    Component.call(this);

    this.$input = null;
    this.$label = null;
    this.$initComponent();

    if (opt) this.set(opt);
  },

  $initComponent() {
    this.$input = new CheckInput();
    this.$initLabel();
    this.$label.$element.style.cursor = "hand";

    this.$setLayout({
      type: "hbox",
      alignment: "center"
    });
    this.$append(this.$input, this.$label);
  },

  $onClick(event) {
    const target = event.target;
    if (target === this.$input.$element)
      return;

    const child = this.$childByElement(target);
    if (child === this.$label) {
      this.$input.$element.dispatchEvent(new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      }));
    }
  },

  $onDblClick(event) {
    event.preventDefault();
    event.stopPropagation();
  },

  getValue() { return this.$input.getValue(); },
  setValue(value) { this.$input.setValue(value); }
});
xui.CheckBox = CheckBox;

// ============================================================================
// [xui.RadioInput]
// ============================================================================

const RadioInput = xmo({
  $extend: BaseInput,

  $name: ["xui.RadioInput"],
  $cssClass: "xui-radio",

  $properties: {
    value      : { type: "number", domain: "ui", init: CheckState.False }
  },

  constructor(opt) {
    BaseInput.call(this);
    if (opt) this.set(opt);
  },

  getValue(value) {
    const element = this.$element;
    return Number(element.checked);
  },

  setValue(value) {
    const element = this.$element;
    element.checked = !!value;
  },

  $initElement(element) {
    element.type = "radio";
  }
});
xui.RadioInput = RadioInput;

// ============================================================================
// [xui.RadioGroup]
// ============================================================================

const RadioGroup = xmo({
  $extend: Class,

  $properties: {
    name       : { type: "string", init: ""   },
    active     : { type: "object", init: null }
  },

  constructor(opt) {
    this.$name = null;
    this.$active = null;
    this.$components = [];
  },

  $updateActive(newActive, oldActive) {
    if (oldActive)
      oldActive.setValue(false);
    if (newActive)
      newActive.setValue(true);
  },

  getComponents() {
    return this.$components;
  },

  add(radioBox) {
    this.$components.push(radioBox);
    if (radioBox.getValue()) {
      this.$active = radioBox;
    }
  },

  remove(radioBox) {
    const index = this.$components.indexOf(radioBox);
    if (index === -1) return;

    this.$components.remove(index);
    if (this.$active === radioBox) {
      this.$active = null;
    }
  }
});
xui.RadioGroup = RadioGroup;

// ============================================================================
// [xui.RadioBox]
// ============================================================================

const RadioBox = xmo({
  $extend: Component,
  $mixins: [MLabel],

  $name: ["xui.RadioBox", "radiobox"],

  $properties: {
    value      : { type: "number", domain: "ui", init: CheckState.False },
    radioGroup : { type: "object", init: null }
  },

  constructor(opt) {
    Component.call(this);

    this.$input = null;
    this.$label = null;
    this.$radioGroup = null;

    this.$initComponent();
    if (opt) this.set(opt);
  },

  $initComponent() {
    this.$input = new RadioInput();
    this.$input.addListener("change", this.$onChange, this);
    this.$initLabel();

    this.$setLayout({
      type: "hbox",
      alignment: "center"
    });
    this.$append(this.$input, this.$label);
  },

  $updateRadioGroup(newGroup, oldGroup) {
    if (oldGroup) oldGroup.remove(this);
    if (newGroup) newGroup.add(this);
  },

  getValue() { return this.$input.getValue(); },
  setValue(value) { this.$input.setValue(value); },

  $onChange(event) {
    const group = this.$radioGroup;
    if (!group) return;

    const target = event.target;
    const active = target.$xui;

    if (target.checked && active) {
      group.setActive(active);
    }
  }
});
xui.RadioBox = RadioBox;

// ============================================================================
// [xui.BaseButton]
// ============================================================================

const BaseButton = xmo({
  $extend: Component,
  $mixins: [MLabel],

  $name: ["xui.BaseButton"],
  $tagName: "button",
  $cssClass: "xui-button",

  $properties: {
    tabIndex: { override: true, init: 0  }
  },

  constructor(opt) {
    Component.call(this);
    this.$initComponent();
    if (opt) this.set(opt);
  },

  $initComponent() {
    this.$initLabel();
    this.$setLayout({
      type: "hbox"
    });
    this.$append(this.$label);
  },

  $initElement(element) {
    element.type = "button";
  }
});
xui.BaseButton = BaseButton;

// ============================================================================
// [xui.Button]
// ============================================================================

const Button = xmo({
  $extend: BaseButton,

  $name: ["xui.Button", "button"],

  constructor(opt) {
    BaseButton.call(this);
    if (opt) this.set(opt);
  }
});
xui.Button = Button;

// ============================================================================
// [xui.ToolBar]
// ============================================================================

const ToolBar = xmo({
  $extend: Container,

  $name: ["xui.ToolBar", "toolbar"],
  $tagName: "div",
  $cssClass: "xui-toolbar",

  $properties: {},

  constructor(opt) {
    Container.call(this);
    this.setLayout({
      type: "hbox",
      gap: 2
    });
    if (opt) this.set(opt);
  }
});
xui.ToolBar = ToolBar;

// ============================================================================
// [xui.ToolButton]
// ============================================================================

const ToolButton = xmo({
  $extend: BaseButton,

  $name: ["xui.ToolButton", "toolbutton"],
  $cssClass: "xui-toolbutton",

  $properties: {
    tabIndex: { override: true, init: -1 }
  },

  constructor(opt) {
    BaseButton.call(this);
    this.setTabIndex(-1);
    if (opt) this.set(opt);
  }

});
xui.ToolButton = ToolButton;

// ============================================================================
// [xui.ToolSeparator]
// ============================================================================

const ToolSeparator = xmo({
  $extend: Component,
  $name: ["xui.ToolSeparator", "toolseparator"],

  $cssClass: "xui-toolseparator",
  $properties: {},

  constructor(opt) {
    Component.call(this);
    if (opt) this.set(opt);
  }

});
xui.ToolSeparator = ToolSeparator;

// ============================================================================
// [xui.Panel]
// ============================================================================

const Panel = xmo({
  $extend: Composite,

  $name: ["xui.Panel", "panel"],
  $cssClass: "xui-panel",

  $properties: {
    collapsible: { type: "bool"  , domain: "ui", init: false },
    collapsed  : { type: "bool"  , domain: "ui", init: false },
    text       : { type: "string", domain: "ui", init: ""    },
    html       : { type: "string", domain: "ui", init: ""    }
  },

  constructor(opt) {
    Composite.call(this);

    this.$collapsible = false;
    this.$collapsed = false;

    this.$setLayout("vbox");
    this.$initComponent();

    if (opt) this.set(opt);
  },

  $initComponent() {
    this.$head = new Component();
    this.$head.$setLayout("hbox");
    this.$head.setClass("xui-head");
    this.$container.setClass("xui-area");

    this.$caption = new Text();
    this.$head.$append(this.$caption);
    this.$head.addListener("click", this.$onHeadClick, this);

    this.$prepend(this.$head);
  },

  expand() { this.setCollapsed(false); },
  collapse() { this.setCollapsed(true); },

  getText() { return this.$caption.getText(); },
  setText(value) { this.$caption.setText(value); },

  getHtml() { return this.$caption.getHtml(); },
  setHtml(value) { this.$caption.setHtml(value); },

  $updateCollapsible(collapsible) {
    if (!collapsible && this.getCollapsed())
      this.setCollapsed(false);
    this.$head.$element.style.cursor = collapsible ? "hand" : "";
  },

  $updateCollapsed(value) {
    this.$container.$element.style.display = value ? "none" : "";
    this.forceClass("xui-collapsed", value);
  },

  $onHeadClick(event) {
    if (this.getCollapsible()) {
      event.preventDefault();
      this.setCollapsed(!this.getCollapsed());
    }
  }
});
xui.Panel = Panel;

// ============================================================================
// [xui.MenuBar]
// ============================================================================

const MenuBar = xmo({
  $extend: Splittable,

  $name: ["xui.MenuBar", "menubar"],
  $tagName: "div",
  $cssClass: "xui-menubar",

  $properties: {},

  constructor(opt) {
    Container.call(this);
    this.$setLayout("hbox");
    if (opt) this.set(opt);
  }
});
xui.MenuBar = MenuBar;

// ============================================================================
// [xui.MenuItem]
// ============================================================================

const MenuItem = xmo({
  $extend: Splittable,
  $mixins: [MLabel],

  $name: ["xui.MenuItem", "menuitem"],
  $cssClass: "xui-menuitem",

  $properties: {
    text     : { type: "string", domain: "ui", init: "" },
    html     : { type: "string", domain: "ui", init: "" },
    accel    : { type: "string", domain: "ui", init: "" }
  },

  constructor(opt) {
    Splittable.call(this);

    this.$label = null;
    this.$accelText = null;
    this.$initComponent();

    if (opt) this.set(opt);
  },

  $initComponent() {
    this.$initLabel();
    this.$accelText = new Text();
    this.$accelText.hide();

    this.$setLayout("hbox");
    this.$prepend(this.$label, this.$accelText);
  },

  $updateAccel(value) {
    this.$accelText.setText(value);
  }
});
xui.MenuItem = MenuItem;

// ============================================================================
// [xui.MItem]
// ============================================================================

const MItem = xmo.mixin({
  $mixins: [Mixin],

  $properties: {
    active   : { $type: "bool", $domain: "ui", $init: false }
  },

  $initItem() {
    this.$active = false;
  }
});
xui.MItem = MItem;

// ============================================================================
// [xui.MSelectionHandler]
// ============================================================================

const MSelectionHandler = xmo.mixin({
  $mixins: [Mixin],

});
xui.MSelectionHandler = MSelectionHandler;

// ============================================================================
// [xui.BaseView]
// ============================================================================

const BaseView = xmo({
  $extend: Composite,
  $mixins: [MSelectionHandler],

  $name: ["xui.BaseView"],

  $properties: {
    activeIndex: { type: "number", domain: "ui", init: -1 }
  },

  constructor(opt) {
    Composite.call(this);

    this.$activeIndex = -1;
    this.setTabIndex(0);
    this.setScrollable(true);

    if (opt) this.set(opt);
  },

  setActiveIndex(value, scrollHint) {
    const oldIndex = this.$activeIndex;
    const newIndex = Math.min(value, this.getChildren().length);

    const child = newIndex === -1 ? null : this.getChildren()[newIndex];
    if (child)
      child.$cachedIndex = newIndex;

    if (newIndex !== oldIndex) {
      this.$activeIndex = newIndex;
      this.$updateActiveIndex(newIndex, oldIndex);
    }

    if (child && scrollHint !== undefined) {
      this.scrollToChild(this.getChildren()[newIndex], scrollHint);
    }
  },

  scrollToChild(child, scrollHint) {
    if (!child)
      return;

    const viewStart = this.getScrollTop();
    const viewEnd = this.getClientHeight() + viewStart;

    const bounds = this.childBounds(child);
    const childStart = bounds.y;
    const childEnd = bounds.y + bounds.h;

    console.log(`${viewStart} ${viewEnd}`);
    if (childStart < viewStart || childEnd > viewEnd) {
      child.$element.scrollIntoView({
        block: scrollHint,
        behavior: "instant"
      });
    }
  },

  firstVisibleItemIndex() {
    const y = this.getScrollTop();
    const child = this.childAtPoint(null, y);

    return this.indexOfChild(child);
  },

  lastVisibleItemIndex() {
    const y = this.getScrollTop() + this.getClientHeight() - 1;
    const child = this.childAtPoint(null, y);

    return this.indexOfChild(child);
  },

  $updateActiveIndex(newIndex, oldIndex) {
    const children = this.getChildren();

    if (oldIndex !== -1) children[oldIndex].setActive(false);
    if (newIndex !== -1) children[newIndex].setActive(true);
  },

  $onMouseDown(event) {
    if (event.button === 0) {
      const child = this.childByElement(event.target);
      if (child) {
        this.setActiveIndex(this.indexOfChild(child));
      }
    }
  },

  $onKeyDown(event) {
    var handled = false;

    switch (event.key) {
      case "Home"     : handled = this.$onMoveAction("Start"   ); break;
      case "End"      : handled = this.$onMoveAction("End"     ); break;
      case "ArrowUp"  : handled = this.$onMoveAction("MoveUp"  ); break;
      case "ArrowDown": handled = this.$onMoveAction("MoveDown"); break;
      case "PageUp"   : handled = this.$onMoveAction("PageUp"  ); break;
      case "PageDown" : handled = this.$onMoveAction("PageDown"); break;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  },

  $onMoveAction(action) {
    var index = this.$activeIndex;
    var lastIndex = this.getChildren().length - 1;
    var scrollHint = null;

    if (lastIndex === -1)
      return false;

    switch (action) {
      case "Start":
        index = 0;
        scrollHint = "start";
        break;

      case "End":
        index = lastIndex;
        scrollHint = "end";
        break;

      case "MoveUp":
        index = Math.max(index - 1, 0);
        scrollHint = "start";
        break;

      case "MoveDown":
        index = Math.min(index + 1, lastIndex);
        scrollHint = "end";
        break;

      case "PageUp":
        index = this.firstVisibleItemIndex();
        if (index === -1)
          return true;

        if (index === this.$activeIndex) {
          const y = this.getScrollTop() - this.getClientHeight();
          if (y > 0) {
            const child = this.childAtPoint(null, y);
            if (child) index = this.indexOfChild(child);
          }
          else {
            index = 0;
          }
        }

        scrollHint = "start";
        break;

      case "PageDown":
        index = this.lastVisibleItemIndex();
        if (index === -1)
          return true;

        if (index === this.$activeIndex) {
          const y = this.getScrollTop() + this.getClientHeight() * 2 - 1;
          if (y < this.getScrollHeight()) {
            const child = this.childAtPoint(null, y);
            if (child) index = this.indexOfChild(child);
          }
          else {
            index = lastIndex;
          }
        }

        scrollHint = "end";
        break;

      default:
        return false;
    }

    if (index != this.$activeIndex) {
      this.setActiveIndex(index, scrollHint);
    }

    return true;
  }
});
xui.BaseView = BaseView;

// ============================================================================
// [xui.ListView]
// ============================================================================

const ListView = xmo({
  $extend: BaseView,

  $name: ["xui.ListView", "listview"],
  $cssClass: "xui-listview",

  $properties: {},

  constructor(opt) {
    BaseView.call(this);
    this.$initComponent();
    if (opt) this.set(opt);
  },

  $initComponent() {
    this.setLayout("vbox");
  }
});
xui.ListView = ListView;

// ============================================================================
// [xui.ListItem]
// ============================================================================

const ListItem = xmo({
  $extend: Component,
  $mixins: [MItem, MLabel],

  $name: ["xui.ListItem", "listitem"],
  $tagName: "div",
  $cssClass: "xui-listitem",

  $properties: {
  },

  constructor(opt) {
    Component.call(this);
    this.$initComponent();
    if (opt) this.set(opt);
  },

  $initComponent() {
    this.$initItem();
    this.$initLabel();
    this.$setLayout("hbox");
    this.$append(this.$label);
  },

  $updateActive(value) {
    this.forceClass("xui-active", value);
  }
});
xui.ListItem = ListItem;

}).call(this);
