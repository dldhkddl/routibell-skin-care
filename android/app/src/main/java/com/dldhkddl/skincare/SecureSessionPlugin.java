package com.dldhkddl.skincare;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final String KEY_ALIAS = "account-session-v1";

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("account-session", Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            String stored = preferences().getString("value", "");
            String value = "";
            if (!stored.isEmpty()) {
                String[] parts = stored.split("\\.");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                value = new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
            }
            JSObject result = new JSObject();
            result.put("value", value);
            call.resolve(result);
        } catch (Exception failure) {
            call.reject("로그인 정보를 안전하게 불러오지 못했어요.");
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String value = call.getString("value", "");
        if (!value.matches("[a-f0-9]{64}")) { call.reject("로그인 형식을 확인해 주세요."); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            String stored = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." +
                Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!preferences().edit().putString("value", stored).commit()) throw new IllegalStateException();
            call.resolve();
        } catch (Exception failure) { call.reject("로그인 정보를 안전하게 저장하지 못했어요."); }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (preferences().edit().clear().commit()) call.resolve();
        else call.reject("로그인 정보를 지우지 못했어요.");
    }
}
