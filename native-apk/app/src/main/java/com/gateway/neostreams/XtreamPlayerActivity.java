package com.gateway.neostreams;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.AsyncTask;
import android.os.Bundle;
import android.util.Log;
import android.view.SurfaceView;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class XtreamPlayerActivity extends Activity {

    private static final String TAG = "NeoStreams";
    private static final String PREFS_NAME = "NeoStreamsPrefs";
    private static String SERVER_URL = "http://192.168.1.199:3000";

    private SurfaceView surfaceView;
    private TextView statusText;
    private TextView titleText;
    private Button retryButton;
    private XtreamPlayer player;

    private String xtreamUrl;
    private String streamUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_xtream_player);

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        SERVER_URL = prefs.getString("server_url", SERVER_URL);

        surfaceView = findViewById(R.id.surfaceView);
        statusText = findViewById(R.id.statusText);
        titleText = findViewById(R.id.titleText);
        retryButton = findViewById(R.id.retryButton);

        titleText.setText("NEOSTREAMS - PLAYER");
        titleText.setTextColor(getResources().getColor(R.color.cp_primary));
        titleText.setLetterSpacing(0.15f);

        xtreamUrl = getIntent().getStringExtra("xtream_url");
        if (xtreamUrl == null) {
            statusText.setText("ERRO: URL Xtream não fornecida");
            statusText.setTextColor(getResources().getColor(R.color.cp_error));
            Toast.makeText(this, "URL Xtream não fornecida", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        player = new XtreamPlayer(this, surfaceView.getHolder().getSurface());
        loadXtreamPlaylist(xtreamUrl);

        retryButton.setOnClickListener(v -> {
            statusText.setText("Tentando reconectar...");
            statusText.setTextColor(getResources().getColor(R.color.cp_warning));
            loadXtreamPlaylist(xtreamUrl);
        });
    }

    private static class XtreamResult {
        boolean success;
        String playlistContent;
        String firstStreamUrl;
        String error;
    }

    private class XtreamConfigTask extends AsyncTask<String, Void, XtreamResult> {
        @Override
        protected XtreamResult doInBackground(String... params) {
            XtreamResult result = new XtreamResult();
            try {
                URL url = new URL(params[0]);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Accept", "application/json");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);

                int responseCode = connection.getResponseCode();
                BufferedReader reader;
                if (responseCode >= 200 && responseCode < 300) {
                    reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                } else {
                    reader = new BufferedReader(new InputStreamReader(connection.getErrorStream()));
                }

                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line).append("\n");
                }
                reader.close();

                if (responseCode >= 200 && responseCode < 300) {
                    result.success = true;
                    result.playlistContent = response.toString();
                    String[] lines = response.toString().split("\n");
                    for (String l : lines) {
                        l = l.trim();
                        if (!l.startsWith("#") && !l.isEmpty()) {
                            result.firstStreamUrl = l;
                            break;
                        }
                    }
                } else {
                    result.success = false;
                    result.error = "HTTP " + responseCode;
                }

            } catch (java.net.UnknownHostException e) {
                Log.e(TAG, "Xtream config error - unknown host", e);
                result.success = false;
                result.error = "Servidor Xtream inacessível.";
            } catch (Exception e) {
                Log.e(TAG, "Xtream config error", e);
                result.success = false;
                result.error = "Erro: " + e.getMessage();
            }
            return result;
        }

        @Override
        protected void onPostExecute(XtreamResult result) {
            if (result.success && result.firstStreamUrl != null) {
                startPlayback(result.firstStreamUrl, "NeoStreams Xtream");
            } else {
                statusText.setText("Erro: " + (result.error != null ? result.error : "Playlist inválida"));
                statusText.setTextColor(getResources().getColor(R.color.cp_error));
                Toast.makeText(XtreamPlayerActivity.this, "Falha ao carregar playlist Xtream", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void loadXtreamPlaylist(String url) {
        statusText.setText("Carregando playlist Xtream...");
        statusText.setTextColor(getResources().getColor(R.color.cp_primary));
        new XtreamConfigTask().execute(url);
    }

    private void startPlayback(String url, String name) {
        this.streamUrl = url;
        statusText.setText("Buffering...\n" + name);
        statusText.setTextColor(getResources().getColor(R.color.cp_text_secondary));
        try {
            player.setDataSource(url);
            statusText.setText("Reproduzindo: " + name);
            statusText.setTextColor(getResources().getColor(R.color.cp_success));
        } catch (Exception e) {
            Log.e(TAG, "Error setting data source", e);
            statusText.setText("Erro de Reprodução: " + e.getMessage());
            statusText.setTextColor(getResources().getColor(R.color.cp_error));
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
