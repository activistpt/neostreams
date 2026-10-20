package com.gateway.neostreams;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.AsyncTask;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

public class MainActivity extends Activity {

    private static final String TAG = "NeoStreams";
    private static final String PREFS_NAME = "NeoStreamsPrefs";
    private static final String KEY_AUTH_TOKEN = "auth_token";
    private static final String KEY_USER = "user";
    private static final String SERVER_URL = "http://192.168.1.199:3000";

    private EditText usernameEdit;
    private EditText passwordEdit;
    private Button loginButton;
    private ProgressBar progressBar;
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        usernameEdit = findViewById(R.id.usernameEdit);
        passwordEdit = findViewById(R.id.passwordEdit);
        loginButton = findViewById(R.id.loginButton);
        progressBar = findViewById(R.id.progressBar);
        statusText = findViewById(R.id.statusText);

        statusText.setText("Sistema de Segurança NeoStreams");
        statusText.setTextColor(getResources().getColor(R.color.cp_text_secondary));

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String savedToken = prefs.getString(KEY_AUTH_TOKEN, null);
        if (savedToken != null && !savedToken.isEmpty()) {
            statusText.setText("Restaurando sessão...");
            checkAuthAndNavigate(savedToken, prefs.getString(KEY_USER, ""));
        }

        loginButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String username = usernameEdit.getText().toString().trim();
                String password = passwordEdit.getText().toString().trim();

                if (TextUtils.isEmpty(username) || TextUtils.isEmpty(password)) {
                    statusText.setText("Credenciais não fornecidas");
                    Toast.makeText(MainActivity.this, "Por favor, insira usuário e senha", Toast.LENGTH_SHORT).show();
                    return;
                }

                statusText.setText("Conectando ao gateway...");
                statusText.setTextColor(getResources().getColor(R.color.cp_primary));
                progressBar.setVisibility(View.VISIBLE);
                loginButton.setEnabled(false);

                new LoginTask().execute(username, password);
            }
        });
    }

    private class LoginResult {
        boolean success;
        String token;
        String user;
        String error;
    }

    private class LoginTask extends AsyncTask<String, Void, LoginResult> {
        @Override
        protected LoginResult doInBackground(String... params) {
            LoginResult result = new LoginResult();
            try {
                URL url = new URL(SERVER_URL + "/api/auth");
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                connection.setRequestProperty("Accept", "application/json");
                connection.setDoOutput(true);
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);

                String postData = "user=" + URLEncoder.encode(params[0], "UTF-8") +
                        "&pass=" + URLEncoder.encode(params[1], "UTF-8");
                OutputStreamWriter writer = new OutputStreamWriter(connection.getOutputStream());
                writer.write(postData);
                writer.flush();
                writer.close();

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
                    JSONObject obj = new JSONObject(response.toString());
                    result.success = obj.optBoolean("ok", false);
                    result.token = obj.optString("token", null);
                    result.user = obj.optString("user", params[0]);
                } else {
                    try {
                        JSONObject obj = new JSONObject(response.toString());
                        result.success = false;
                        result.error = obj.optString("error", "Unknown error");
                    } catch (Exception e) {
                        result.success = false;
                        result.error = "HTTP " + responseCode;
                    }
                }

            } catch (java.net.UnknownHostException e) {
                Log.e(TAG, "Login error - unknown host", e);
                result.success = false;
                result.error = "Servidor inacessível. Verifique o IP.";
            } catch (Exception e) {
                Log.e(TAG, "Login error", e);
                result.success = false;
                result.error = "Erro: " + e.getMessage();
            }
            return result;
        }

        @Override
        protected void onPostExecute(LoginResult result) {
            progressBar.setVisibility(View.GONE);
            loginButton.setEnabled(true);

            if (result.success) {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                SharedPreferences.Editor editor = prefs.edit();
                editor.putString(KEY_AUTH_TOKEN, result.token);
                editor.putString(KEY_USER, result.user);
                editor.apply();

                statusText.setText("Conexão estabelecida!");
                statusText.setTextColor(getResources().getColor(R.color.cp_success));
                Toast.makeText(MainActivity.this, "Login efetuado com sucesso!", Toast.LENGTH_SHORT).show();
                checkAuthAndNavigate(result.token, result.user);
            } else {
                statusText.setText("FALHA: " + result.error);
                statusText.setTextColor(getResources().getColor(R.color.cp_error));
                Toast.makeText(MainActivity.this, result.error, Toast.LENGTH_LONG).show();
            }
        }
    }

    private void checkAuthAndNavigate(String token, String user) {
        new AuthCheckTask().execute(token, user);
    }

    private class AuthCheckTask extends AsyncTask<String, Void, Boolean> {
        @Override
        protected Boolean doInBackground(String... params) {
            try {
                URL url = new URL(SERVER_URL + "/api/health");
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Authorization", "Bearer " + params[0]);
                connection.setRequestProperty("Accept", "application/json");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);

                int responseCode = connection.getResponseCode();
                return responseCode >= 200 && responseCode < 300;
            } catch (Exception e) {
                Log.e(TAG, "Auth check error", e);
                return false;
            }
        }

        @Override
        protected void onPostExecute(Boolean success) {
            if (success) {
                Intent intent = new Intent(MainActivity.this, NeoStreamsActivity.class);
                startActivity(intent);
                finish();
            } else {
                SharedPreferences.Editor editor = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit();
                editor.remove(KEY_AUTH_TOKEN);
                editor.remove(KEY_USER);
                editor.apply();
                statusText.setText("Sessão expirada. Faça login novamente.");
                statusText.setTextColor(getResources().getColor(R.color.cp_error));
                loginButton.setEnabled(true);
            }
        }
    }
}
