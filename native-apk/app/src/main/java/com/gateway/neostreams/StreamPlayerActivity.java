package com.gateway.neostreams;

import android.app.Activity;
import android.os.AsyncTask;
import android.os.Bundle;
import android.util.Log;
import android.view.SurfaceView;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class StreamPlayerActivity extends Activity {

    private static final String TAG = "NeoStreams";

    private SurfaceView surfaceView;
    private TextView statusText;
    private TextView titleText;
    private Button retryButton;
    private StreamPlayer player;

    private String streamUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_stream_player);

        surfaceView = findViewById(R.id.surfaceView);
        statusText = findViewById(R.id.statusText);
        titleText = findViewById(R.id.titleText);
        retryButton = findViewById(R.id.retryButton);

        titleText.setText("NEOSTREAMS - PLAYER");
        titleText.setTextColor(getResources().getColor(R.color.cp_secondary));
        titleText.setLetterSpacing(0.15f);

        streamUrl = getIntent().getStringExtra("stream_url");
        if (streamUrl == null) {
            statusText.setText("ERRO: URL Stream não fornecida");
            statusText.setTextColor(getResources().getColor(R.color.cp_error));
            Toast.makeText(this, "URL Stream não fornecida", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        player = new StreamPlayer(this, surfaceView.getHolder().getSurface());
        startStreamPlayback(streamUrl);

        retryButton.setOnClickListener(v -> {
            statusText.setText("Tentando reconectar...");
            statusText.setTextColor(getResources().getColor(R.color.cp_warning));
            startStreamPlayback(streamUrl);
        });
    }

    private void startStreamPlayback(String url) {
        statusText.setText("Buffering...\n" + url);
        statusText.setTextColor(getResources().getColor(R.color.cp_text_secondary));
        new StreamPlaybackTask().execute(url);
    }

    private class StreamPlaybackTask extends AsyncTask<String, Void, String> {
        @Override
        protected String doInBackground(String... params) {
            try {
                URL url = new URL(params[0]);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setRequestProperty("User-Agent", "NeoStreams-Android/1.0");
                connection.setRequestProperty("Range", "bytes=0-");
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(30000);

                int responseCode = connection.getResponseCode();
                if (responseCode >= 200 && responseCode < 300) {
                    return "OK:" + connection.getResponseMessage();
                } else if (responseCode == 206) {
                    return "Partial OK:" + connection.getResponseMessage();
                } else {
                    return "Error " + responseCode + ":" + connection.getResponseMessage();
                }
            } catch (java.net.UnknownHostException e) {
                Log.e(TAG, "Stream playback error - unknown host", e);
                return "Erro: Host inacessível";
            } catch (Exception e) {
                Log.e(TAG, "Stream playback error", e);
                return "Erro: " + e.getMessage();
            }
        }

        @Override
        protected void onPostExecute(String result) {
            statusText.setText("Status: " + result + "\nPronto para Reprodução");
            statusText.setTextColor(getResources().getColor(R.color.cp_text_primary));

            try {
                player.setDataSource(streamUrl);
                statusText.setText("Pronto para reprodução. Click no botão de retry para forçar reconexão.");
                statusText.setTextColor(getResources().getColor(R.color.cp_success));
            } catch (Exception e) {
                Log.e(TAG, "Error setting data source", e);
                statusText.setText("Erro de Reprodução: " + e.getMessage());
                statusText.setTextColor(getResources().getColor(R.color.cp_error));
            }
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) {
            player.release();
        }
    }
}
