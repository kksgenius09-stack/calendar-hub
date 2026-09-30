$mobileEnv = @{}
Get-Content -LiteralPath "..\.env.local" -Encoding utf8 | ForEach-Object {
  if ($_ -match '^(?<key>[^#=]+)=(?<value>.*)$') {
    $mobileEnv[$matches.key.Trim()] = $matches.value.Trim().Trim([char]34)
  }
}

$env:EXPO_PUBLIC_SUPABASE_URL = $mobileEnv['NEXT_PUBLIC_SUPABASE_URL']
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $mobileEnv['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
$env:EXPO_PUBLIC_API_URL = 'https://oncal-calendar-hub.racing-lemur-4380.chatgpt.site'
# Leave this unset in Expo Go. expo-auth-session will generate the LAN exp://
# callback for the QR session. Standalone builds use the configured app scheme.
Remove-Item Env:EXPO_PUBLIC_AUTH_REDIRECT_URL -ErrorAction SilentlyContinue

npx expo start --lan --clear --port 8082
