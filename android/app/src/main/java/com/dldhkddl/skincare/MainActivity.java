package com.dldhkddl.skincare;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureSessionPlugin.class);
        registerPlugin(KakaoNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
