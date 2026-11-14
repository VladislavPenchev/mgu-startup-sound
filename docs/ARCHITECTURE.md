# Архитектура

## Store, SDK и жизнен цикъл

`mgu-repo.json` описва apps/*/app.json, Python build и изходния .tgz пакет.
Kit е фиксиран до commit (THIRD_PARTY_NOTICES), без мрежови зависимости при build.
Store предоставя собственото oap-sdk на мултимедията. Build генерира RHMI екрани,
entry point, SOME/IP manifest и инсталационни пакети. GPU renderer е незадължителен:
софтуерният renderer е достатъчен за този 2 fps статус.

`autostart: true` се превръща в `mguAppStartType: autostart`.
`mgu.run({background, start})` оставя SDK/kit да регистрира ACTIVE и да управлява
жизнения цикъл. Background работи и без RHMI екран. Start показва интерфейса.

## Сигнали

Само абонаменти, без периодични диагностични заявки към ECU:

- CDS.statusEngineSpeed2.actualValueRPMEngineCrankshaft ×0.25 → rpm;
- Vehicle2.statusCarSpeed2.speedVehicleCentreOfGravity ×0.015625 → km/h;
- VehicleCondition.statusConditionVehicle → ignition / ready / parked.

Невалидни стойности стават unknown и не могат да пуснат звук. Няма demo fallback.

## Session

`session.js` използва монотонно време process.hrtime, независимо от синхронизирането
на часовника на колата. Нов процес винаги започва disarmed.

1. Състояние 1/2/3/5/7 и rpm<400 за 1,5 s активира следващо запалване.
2. Състояние 8/10 и rpm>=400 започва закъснението; необходима е известна скорост <3.
3. Сесията се консумира преди заявката за аудио. При неуспех няма автоматично повторение.
4. RPM=0 при състояние 10 не активира нов поздрав, независимо от времето на светофар.
5. Потегляне / изключване отменят звука. След истинско off състояние може нов цикъл.

`data/session.json` е само диагностичен. Не разрешава поздрав след рестарт.
Старт след вече работещ двигател се пропуска: ограничение за измерване при cold boot.

## Audio

`wav.js`: собствени chimes или data/custom.wav, проверен bounded 48 kHz stereo
16-bit PCM, до 10 s / 3 MB. Софтуерна амплитуда до максимум 50%.
`audio.js`: временен AudioManager маршрут. `player.py`: PCM към SmartX през
libasound.so.2, Python ctypes, без нов native binary.

Параметри от чужд тестван автомобил, **не универсални BMW константи**:
source 287 CarLifeMedia, sink 1024, ALSA plug:smartx:CarLifeMedia_CF_48_STEREO,
Python /var/opt/mgu-python/current/bin/python3. Настройват се в app.json config.

Маршрутът се променя само ако очакваният source присъства, е unavailable и няма
връзки. Активен CarLife / друга app връзка води до отказ. Изчаква CS_CONNECTED.
Освобождава само собствения connection ID, после възстановява availability ако
няма чужда връзка. При неопределен connect резултат не трие чужди маршрути.
Няма sweep, глобални mixer промени или постоянно аудио устройство.

ALSA е nonblocking с краен срок, а родителят има watchdog. Stop отменя pending
подготовка и спира player-а. При принудително убиване от платформата след 200 ms
AudioManager cleanup може да не завърши: първата версия отказва при busy source,
вместо да го изтрива. Тогава е нужна диагностика / рестарт на мултимедията.

Не е потвърдено арбитрирането с разговори / навигация / предупреждения,
достъпът на OAP процеса до ALSA/subprocess и ctypes на конкретния firmware.
Unit тестовете не доказват тези хардуерни възможности.

## Източници

- https://github.com/cauliflowermossgrape/idrive7-apps — kit runtime/build,
  apps/ambient_config за autostart, kit/runtime/car.js за състоянията.
- https://github.com/robertnisipeanu/mgu-store — docs/PUBLISHING.md, source builds,
  native/mgu-python/component.json, native/mgu-updater/updater.conf.
- https://github.com/JustAnotherPU/moonride — примерен AudioManager/SmartX маршрут
  на X5 45e. Python player-ът тук е нов и непроверен в автомобил.
