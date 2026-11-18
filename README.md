# 건프라 지출

서버 없이 기기에 구매 내역과 예산을 저장하는 Android/iOS 앱입니다. 원본 HTML도 브라우저에서 단독 실행할 수 있습니다.

## 실행과 빌드

### PC에 Android SDK 없이 APK 만들기

`.github/workflows/android-apk.yml`은 GitHub 서버에서 Android만 빌드합니다. 로컬 PC에 Android SDK나 Android Studio를 설치할 필요가 없습니다. iOS 빌드는 실행하지 않습니다.

1. GitHub에 빈 저장소를 만들고 이 프로젝트를 기본 브랜치에 올립니다. `node_modules/`와 `www/`는 제외하고, 숨김 폴더 `.github/`, `android/`, `package-lock.json`을 포함합니다. Git으로 올리면 `.gitignore`가 생성 파일을 제외합니다.
2. 저장소의 **Actions → Android APK → Run workflow**를 실행합니다.
3. 완료된 실행의 **Artifacts**에서 `gunpla-spend-debug-실행번호`를 다운로드하고 압축을 풀어 `app-debug.apk`를 휴대폰에 설치합니다. 결과물은 7일간 보관됩니다.

수동 실행만 지원하며 GitHub 서버에서 의존성 설치, 브라우저 테스트, APK 빌드를 수행합니다. 원격 빌드 실행은 저장소를 연결한 뒤에 가능합니다. 테스트용 APK이며 Play 스토어용 배포 서명은 포함하지 않습니다. 실행마다 디버그 서명 키가 달라질 수 있으므로 기존 설치본에 업데이트가 거부되면 JSON을 백업한 뒤 재설치하세요.

### 로컬 빌드가 필요한 경우

Node.js 22 이상에서 `npm ci`로 의존성을 설치합니다.

```sh
npm run build   # 원본 HTML과 네이티브 연결 코드를 www/에 빌드
npm run sync    # Android/iOS 프로젝트에 반영
```

Android는 Android Studio 2025.2.1 이상, JDK 21, Android SDK Platform 36이 필요합니다. `npm run android`로 프로젝트를 열고 실행하거나 APK를 생성합니다. CLI로 테스트용 APK를 생성하려면:

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

출력: `android/app/build/outputs/apk/debug/app-debug.apk`. macOS/Linux에서는 `./gradlew assembleDebug`를 사용합니다. 배포용 APK/AAB는 Android Studio의 **Generate Signed App Bundle / APK**에서 본인 키로 서명합니다. 업데이트에는 같은 앱 ID와 서명 키가 필요합니다.

iOS는 **Mac과 Xcode 26 이상**에서 `npm ci` 후 `npm run ios`를 실행합니다. Xcode의 Signing & Capabilities에서 본인 Team을 선택하고 기기 실행 또는 Archive를 진행합니다. 앱 ID는 `com.gunpla.spend`, 표시 이름은 `건프라 지출`이며 기본값은 `capacitor.config.json`에 있습니다. 앱 ID를 변경한다면 Android `applicationId`/`namespace`와 Xcode Bundle Identifier도 함께 변경해야 합니다. Windows에서는 iOS 프로젝트 준비까지만 가능합니다.

## 데이터와 백업

- 앱: Android SharedPreferences / iOS UserDefaults에 저장합니다. 앱 삭제 시 데이터도 삭제됩니다.
- HTML: 실행한 브라우저의 localStorage에 저장합니다. 원본 HTML의 파일명과 위치를 유지하는 편이 안전합니다.
- 브라우저 데이터는 앱으로 자동 이동하지 않습니다. HTML에서 JSON을 내보낸 뒤 앱 상단의 불러오기로 복원하세요. 앱의 내보내기는 OS 공유 창을 열며, 여기서 파일 저장을 선택할 수 있습니다.
- 불러오기는 기존 내역과 예산을 교체합니다. Android와 iOS 간에도 같은 JSON 백업을 사용합니다. 계정 동기화는 없습니다.

화면과 계산 로직은 `gunpla_spend_tracker_editable_price.html`, 기기 저장·공유·Android 뒤로 가기 처리는 `mobile/native.js`가 원본입니다. 생성된 `www/`나 플랫폼 안의 `public/` 파일을 직접 수정하지 마세요.

## 검증

```sh
npx playwright install chromium
npm run build
npm test
```

Windows에서 설치된 Edge를 사용하려면 `$env:PW_CHANNEL = 'msedge'`를 설정하고 `npm test`를 실행할 수 있습니다. 테스트는 실제 브라우저에서 HTML 기능과 Capacitor 연결 코드를 검증합니다. OS 플러그인은 테스트용으로 대체하므로, 배포 전 Android/iPhone에서 파일 선택·공유·재실행 후 데이터 유지·화면 여백을 확인해야 합니다. 네이티브 빌드와 서명은 해당 플랫폼 도구가 필요합니다.

참고: [개발 환경](https://capacitorjs.com/docs/getting-started/environment-setup), [기기 저장](https://capacitorjs.com/docs/apis/preferences), [파일 공유](https://capacitorjs.com/docs/apis/share).

## 기여자

- [unta1337](https://github.com/unta1337): 프로젝트 기획, 요구사항 및 저장소 관리.
- [OpenAI Codex](https://github.com/codex): 앱 안정화, Android/iOS 패키징 구성, 자동 테스트 및 원격 Android 빌드 구현 지원.
