package com.gateway.neostreams;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.AsyncTask;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ListView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

public class NeoStreamsActivity extends Activity {

    private static final String TAG = "NeoStreams";
    private static final String PREFS_NAME = "NeoStreamsPrefs";
    private static String SERVER_URL = "http://192.168.1.199:3000";

    private ListView playlistListView;
    private PlaylistAdapter playlistAdapter;
    private List<PlaylistSource> playlistSources;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_neo_streams);

        playlistListView = findViewById(R.id.playlistListView);
        playlistAdapter = new PlaylistAdapter(this, R.layout.item_playlist);
        playlistListView.setAdapter(playlistAdapter);

        playlistListView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                PlaylistSource source = playlistSources.get(position);
                if ("xtream-m3u".equals(source.type)) {
                    openXtreamPlayer(source);
                } else {
                    openStreamPlayer(source.url);
                }
            }
        });

        loadPlaylists();
    }

    private class PlaylistResult {
        boolean success;
        List<PlaylistSource> sources;
        String error;
    }

    private class PlaylistLoadTask extends AsyncTask<Void, Void, PlaylistResult> {
        @Override
        protected PlaylistResult doInBackground(Void... params) {
            PlaylistResult result = new PlaylistResult();
            try {
                URL url = new URL(SERVER_URL + "/api/playlists");
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
                    response.append(line);
                }
                reader.close();

                if (responseCode >= 200 && responseCode < 300) {
                    result.sources = new ArrayList<>();
                    JSONArray arr = new JSONArray(response.toString());
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject obj = arr.getJSONObject(i);
                        PlaylistSource s = new PlaylistSource();
                        s.id = obj.optString("id", "");
                        s.name = obj.optString("name", "");
                        s.type = obj.optString("type", "");
                        s.url = obj.optString("url", "");
                        s.xtream = new XtreamConfig();
                        JSONObject xtreamObj = obj.optJSONObject("xtream");
                        if (xtreamObj != null) {
                            s.xtream.base = xtreamObj.optString("base", "");
                            s.xtream.username = xtreamObj.optString("username", "");
                            s.xtream.password = xtreamObj.optString("password", "");
                        }
                        result.sources.add(s);
                    }
                    result.success = true;
                } else {
                    JSONObject obj = new JSONObject(response.toString());
                    result.success = false;
                    result.error = obj.optString("error", "Unknown error");
                }

            } catch (Exception e) {
                Log.e(TAG, "Playlist load error", e);
                result.success = false;
                result.error = "Erro: " + e.getMessage();
            }
            return result;
        }

        @Override
        protected void onPostExecute(PlaylistResult result) {
            if (result.success && result.sources != null) {
                playlistSources = result.sources;
                playlistAdapter.clear();
                playlistAdapter.addAll(playlistSources);
                playlistAdapter.notifyDataSetChanged();

                Toast.makeText(NeoStreamsActivity.this, "Carregadas " + result.sources.size() + " listas", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(NeoStreamsActivity.this, "Erro ao carregar listas: " + result.error, Toast.LENGTH_LONG).show();
            }
        }
    }

    private void loadPlaylists() {
        new PlaylistLoadTask().execute();
    }

    private void openXtreamPlayer(PlaylistSource source) {
        Intent intent = new Intent(this, XtreamPlayerActivity.class);
        intent.putExtra("xtream_url", source.url);
        startActivity(intent);
    }

    private void openStreamPlayer(String url) {
        Intent intent = new Intent(this, StreamPlayerActivity.class);
        intent.putExtra("stream_url", url);
        startActivity(intent);
    }

    public static class PlaylistSource {
        String id;
        String name;
        String type;
        String url;
        XtreamConfig xtream;
    }

    public static class XtreamConfig {
        String base;
        String username;
        String password;
    }

    public static class PlaylistError {
        String error;
    }
}