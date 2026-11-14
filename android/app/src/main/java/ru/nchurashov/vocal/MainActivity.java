package ru.nchurashov.vocal;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // «Назад»: сначала спрашиваем страницу (window.androidBack в router.js) - закрыть окошко или вернуться на прошлый экран.
        // Если страница вернула false (главный экран) - обычное поведение Android.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = getBridge() != null ? getBridge().getWebView() : null;
                if (w == null) { exitApp(); return; }
                w.evaluateJavascript("(window.androidBack ? window.androidBack() : false)", v -> {
                    if (!"true".equals(v)) exitApp();
                });
            }
            private void exitApp() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
