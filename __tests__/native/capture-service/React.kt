package com.facebook.react
import com.facebook.react.bridge.ReactContext
interface ReactApplication{val reactHost:ReactHost?}
interface ReactInstanceEventListener{fun onReactContextInitialized(context:ReactContext)}
class ReactHost{val currentReactContext:ReactContext?=null;fun removeReactInstanceEventListener(l:ReactInstanceEventListener){};fun addReactInstanceEventListener(l:ReactInstanceEventListener){};fun start(){}}
