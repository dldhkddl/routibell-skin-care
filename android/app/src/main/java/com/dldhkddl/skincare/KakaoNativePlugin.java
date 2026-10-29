package com.dldhkddl.skincare;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.kakao.sdk.common.KakaoSdk;
import com.kakao.sdk.user.UserApiClient;
import kotlin.Unit;

@CapacitorPlugin(name = "KakaoNative")
public class KakaoNativePlugin extends Plugin {
    @PluginMethod
    public void login(PluginCall call) {
        if (BuildConfig.KAKAO_NATIVE_APP_KEY.isEmpty()) {
            call.reject("카카오 앱 연결을 아직 준비하지 못했어요.");
            return;
        }
        KakaoSdk.init(getContext(), BuildConfig.KAKAO_NATIVE_APP_KEY);
        UserApiClient.getInstance().loginWithKakaoAccount(getActivity(), (token, error) -> {
            if (error != null || token == null) call.reject("카카오 로그인 확인을 마치지 못했어요.");
            else {
                JSObject result = new JSObject();
                result.put("accessToken", token.getAccessToken());
                call.resolve(result);
            }
            return Unit.INSTANCE;
        });
    }
}
