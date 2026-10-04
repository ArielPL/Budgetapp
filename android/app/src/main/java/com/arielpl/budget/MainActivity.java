package com.arielpl.budget;

import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Hide the budget from the app switcher: Android 13+ shows the app's
        // icon there instead of a picture of the last screen. Screenshots still
        // work — FLAG_SECURE would block them too, and that is not wanted.
        // Before Android 13 there is no way to do one without the other, so
        // older phones keep the picture.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            setRecentsScreenshotEnabled(false);
        }
    }
}
