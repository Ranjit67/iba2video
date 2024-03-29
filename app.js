//
const express = require("express");
const socket = require("socket.io");
var firebase = require("firebase");
const nodemailer = require("nodemailer");
const app = express();
app.use(express.json());
const http = require("http");
require("dotenv").config();
const server = http.createServer(app);

const io = socket(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");

  res.header(
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers,X-Access-Token,XKey,Authorization"
  );

  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
    return res.status(200).json({});
  }
  next();
});
//cors end

//firebase end
const schedule = {};
const room = {};
const idToRoom = {};
const roomToId = {};
const mutedMentor = {};
const videoMute = {};
//student
const studentConnectedTo = {};
const studentIdToUuid = {};
const UuidToStudentId = {};
const recordRaw = {};
// const mentorStaticId = {};

//start
io.on("connection", (socket) => {
  socket.on("mentor start class", async (payload) => {
    const { mentorId, scheduleID } = payload;
    // console.log(room[mentorId]);
    if (room?.[mentorId]?.length > 0 && schedule[mentorId] === scheduleID) {
      await room[mentorId].forEach((userUUid) => {
        const makeSoId = UuidToStudentId[userUUid];
        socket.emit("student want to connect", {
          studentId: makeSoId,
        });
      });
    } else {
      room[mentorId] = [];

      schedule[mentorId] = scheduleID;
      idToRoom[socket.id] = mentorId;
      roomToId[mentorId] = socket.id;
      mutedMentor[mentorId] = true;
      videoMute[mentorId] = true;
    }
  });
  // medil start
  socket.on("mentor refresh try", (payload) => {
    const { mentorUui } = payload;
    delete roomToId[mentorUui];
    roomToId[mentorUui] = socket.id;
    if (roomToId[mentorUui]) {
      // console.log("mentor id");
      delete idToRoom[roomToId[mentorUui]];
      idToRoom[socket.id] = mentorUui;

      socket.emit("already have", "data");
    }
  });

  socket.on("after refresh", (payload) => {
    const { roomRef } = payload;

    if (room[roomRef]) {
      room[roomRef].forEach((key) => {
        socket.emit("student want to connect", {
          studentId: UuidToStudentId[key],
        });
      });
    }
  });
  // join section2
  socket.on("student want to connect", async (payload) => {
    const { mentorUuid, studentUuid, scheduleID } = payload;

    if (UuidToStudentId[studentUuid]) {
      delete studentIdToUuid[UuidToStudentId[studentUuid]];
      studentIdToUuid[socket.id] = studentUuid;
      delete UuidToStudentId[studentUuid];
      UuidToStudentId[studentUuid] = socket.id;
      //change
      if (schedule[mentorUuid] == scheduleID) {
        const mentorSocketId = await roomToId?.[mentorUuid];
        io.to(mentorSocketId).emit("student want to connect", {
          studentId: socket.id,
        });
      } else {
        socket.emit("open dialog", "Class has ended....");
      }
    } else {
      if (roomToId[mentorUuid] && schedule[mentorUuid] == scheduleID) {
        UuidToStudentId[studentUuid] = socket.id;
        studentIdToUuid[socket.id] = studentUuid;

        room[mentorUuid].push(studentUuid);
        const mentiId = await roomToId?.[mentorUuid];
        io.to(mentiId).emit("student want to connect", {
          studentId: socket.id,
          studentUuid,
        });
      } else {
        if (roomToId[mentorUuid]) {
          //   socket.emit("open dialog", "Your mentor does not start class..");
          // } else {
          socket.emit("open dialog", "Your mentor busy with other class...");
        } else {
          // console.log(studentIdToUuid[socket.id]);
          socket.emit("open dialog", "Class has not started yet.");
        }
      }
    }
  });
  //signal send
  socket.on("sending signal", (payload) => {
    const { userToSignal, signal, uid } = payload;
    studentConnectedTo[studentIdToUuid[userToSignal]] = uid;
    io.to(userToSignal).emit("mentor send to student", {
      mentorFrontId: socket.id,
      mentorSignal: signal,
      muteStatus: mutedMentor[idToRoom[socket.id]],
      videoStatus: videoMute[idToRoom[socket.id]],
    });
  });
  socket.on("returning signal", (payload) => {
    const { signal, mentorFrontId } = payload;

    io.to(mentorFrontId).emit("student signal to mentor", {
      studentSignal: signal,
      id: socket.id,
    });
  });

  socket.on("video mute status", (payload) => {
    const { cameraStatus, mentorUuid } = payload;
    videoMute[mentorUuid] = cameraStatus;
    //video signal
    if (room[mentorUuid].length >= 1) {
      room[mentorUuid].forEach((studentUUid) => {
        io.to(UuidToStudentId[studentUUid]).emit("video signal", {
          cameraStatus,
        });
      });
    }
  });

  socket.on("mentor mute status", (payload) => {
    const { mute, mentorUuid } = payload;
    mutedMentor[mentorUuid] = mute;
    //video signal
    if (room[mentorUuid].length >= 1) {
      room[mentorUuid].forEach((studentUUid) => {
        io.to(UuidToStudentId[studentUUid]).emit("mute signal", {
          mute,
        });
      });
    }
  });

  //mute end
  socket.on("end meeting", (payload) => {
    const { mentorUUid } = payload;
    // room[mentorId] = [];
    delete idToRoom[socket.id];
    delete roomToId[mentorUUid];
    delete mutedMentor[mentorUUid];
    delete videoMute[mentorUUid];
    delete schedule[mentorUUid]; // for it host leave card not display

    if (room[mentorUUid]) {
      room[mentorUUid].forEach((studentUuid) => {
        io.to(UuidToStudentId[studentUuid]).emit(
          "connected host leave",
          "data"
        );
        // delete studentIdToUuid[UuidToStudentId[studentUuid]];
        // delete UuidToStudentId[studentUuid];
      });
      delete room[mentorUUid];
    }
    // socket.emit("mentor want to upload video", recordRaw[mentorUUid]);
  });
  socket.on("Student exit himself", (payload) => {
    const { studentUid } = payload;
    if (UuidToStudentId[studentUid]) {
      delete studentIdToUuid[UuidToStudentId[studentUid]];
      delete UuidToStudentId[studentUid];
    }
  });
  socket.on("host take leave it clint side action", (payload) => {
    const { studentUuid } = payload;
    delete studentIdToUuid[socket.id];
    delete UuidToStudentId[studentUuid];
  });
  socket.on("student leave the meeting", (payload) => {
    const { studentId, mentorUuid, tempMessage } = payload;
    if (room[mentorUuid]) {
      const afterLeave = room[mentorUuid].filter((user) => user !== studentId);
      room[mentorUuid] = afterLeave;
      const mentorSocketId = roomToId[mentorUuid];
      io.to(mentorSocketId).emit("one student leave", {
        studentIdUuid: studentId,
        tempMessage,
      });
      delete studentIdToUuid[socket.id];
      delete UuidToStudentId[studentId];
    }
  });
  //message
  socket.on("send message to student", (payload) => {
    const { tempMessage } = payload; //uuid, message
    if (room[tempMessage.uuid].length >= 1) {
      room[tempMessage.uuid].forEach((studentUuid) => {
        if (UuidToStudentId[studentUuid]) {
          io.to(UuidToStudentId[studentUuid]).emit("message receive", {
            tempMessage,
          });
        }
      });
    }
  });
  socket.on("send message to all", (payload) => {
    const { tempMessage, mentorUuid } = payload;

    if (room[mentorUuid]) {
      io.to(roomToId[mentorUuid]).emit("one of the student send message", {
        tempMessage,
      });
    }
  });
  socket.on("send to other", (payload) => {
    const { tempMessage, mentorUuid } = payload;
    if (room[mentorUuid].length > 1) {
      const exceptSender = room[mentorUuid].filter(
        (studentUuid) => studentUuid !== tempMessage.uuid
      );
      exceptSender.forEach((studentUuid) => {
        io.to(UuidToStudentId[studentUuid]).emit(
          "all student get other student data",
          { tempMessage }
        );
      });
    }
  });
  //message end
  //record video start

  socket.on("record start", (payload) => {
    socket.emit("record", "data");
  });
  socket.on("stop record", (payload) => {
    socket.emit("record stop", "data");
  });
  //recording raw data
  socket.on("recording raw data", (payload) => {
    const { record, mentor } = payload;
    if (recordRaw[mentor]) {
      recordRaw[mentor] = [...recordRaw[mentor], record];
    } else {
      recordRaw[mentor] = [record];
    }
    // console.log(mentor);
  });
  socket.on("save in cloud", (payload) => {
    const { mentorUid } = payload;
    //storage
    // console.log(recordRaw[mentorUid]);
  });
  //end Video

  //disconnect part
  socket.on("disconnect", () => {
    if (room[idToRoom[socket.id]]) {
      const mentorUid = idToRoom?.[socket.id];
      const roomTempData = room[mentorUid];
      //clear data from var
      // delete idToRoom[socket.id];
      // if i comment out then refresh will work
      // delete room[mentorUid];
      // delete roomToId[mentorUid];
      // delete mutedMentor[mentorUid];
      // delete videoMute[mentorUid];
      //may be it create issues
      roomTempData.forEach((user) => {
        const studentSocketId = UuidToStudentId?.[user];
        io.to(studentSocketId).emit("connected host leave", "data");
      });
      socket.broadcast.emit("send class already exit", {
        roomToId,
      });
    } else if (studentIdToUuid[socket.id]) {
      const studentIdUuid = studentIdToUuid[socket.id];
      const mentorUuid = studentConnectedTo[studentIdUuid];

      if (room[mentorUuid]) {
        const haveIn = room[mentorUuid].filter((id) => id !== studentIdUuid);
        room[mentorUuid] = haveIn;
      }
      delete UuidToStudentId[studentIdUuid];
      delete studentIdToUuid[socket.id];
      delete studentConnectedTo[studentIdUuid];
      io.to(roomToId[mentorUuid]).emit("one student leave", { studentIdUuid });
    }
  });
});

//live stream 2

//update one stream var
const stream2Mentor = {};
const userSoIdToUidStream2 = {};
const userConnectedTo = {};
const mentorSoIdToUid = {};

io.of("/stream").on("connection", (socket) => {
  // try {
  //user first time join
  socket.on("joining request send", (payload) => {
    try {
      const { mentorId, userId } = payload;

      if (stream2Mentor[mentorId]) {
        userSoIdToUidStream2[socket.id] = userId;
        userConnectedTo[userId] = mentorId;
        const fillTarDta = stream2Mentor?.[mentorId]?.filter(
          (id) => id?.uid !== userId
        );

        fillTarDta?.push({
          type: "user",
          uid: userId,
          soId: socket.id,
        });

        stream2Mentor[mentorId] = fillTarDta;
        fillTarDta.forEach((element) => {
          if (element.uid === userId) {
            null;
          } else if (element.type === "mentor") {
            socket.to(element.soId).emit("send for create peer", {
              userUid: userId,
              mentorShareScreen: element?.screenShare,
            });
          } else if (element.type === "user") {
            socket.to(element.soId).emit("new_user_join", {
              userUid: userId,
            });
          }
          // socket.to(element.soId).emit()
        });
        // const findMentor = stream2Mentor?.[mentorId]?.find(
        //   (id) => id.type === "mentor"
        // );

        // socket.to(findMentor?.soId).emit("send for create peer", {
        //   userUid: userId,
        //   mentorShareScreen: findMentor?.screenShare,
        // });
        //screen share or not check
      } else {
        socket.emit("mentor_does_not_start_the_class");
      }
    } catch (error) {
      new Error(error);
    }
  });
  socket.on("mentor_screen_on", (payload) => {
    try {
      const { userUid } = payload;
      socket.emit("send_create_peer_screen", {
        userUid,
      });
    } catch (error) {
      next(error);
    }
  });
  socket.on("screen_share_off", (payload) => {
    const { mentorUid } = payload;
    const findMentor = stream2Mentor[mentorUid]?.find(
      (id) => id.uid === mentorUid
    );
    const filterMentor = stream2Mentor[mentorUid]?.filter(
      (id) => id.uid !== mentorUid
    );
    filterMentor?.forEach((id) => {
      socket.to(id.soId).emit("screen_stop");
    });
    filterMentor?.push({
      type: "mentor",
      audio: findMentor?.audio,
      video: findMentor?.video,
      screenShare: false,
      soId: socket.id,
      uid: mentorUid,
    });
    stream2Mentor[mentorUid] = filterMentor;
  });
  //mentor first time join
  socket.on("Mentor join", (payload) => {
    try {
      const { mentorId } = payload;
      mentorSoIdToUid[socket.id] = mentorId;
      stream2Mentor[mentorId] = [];
      stream2Mentor[mentorId]?.push({
        type: "mentor",
        audio: true,
        video: true,
        screenShare: false,
        soId: socket.id,
        uid: mentorId,
      });
    } catch (error) {
      new Error(error);
    }
  });

  socket.on("disconnect", () => {
    //user disconnect
    try {
      if (userSoIdToUidStream2[socket.id]) {
        const userUid = userSoIdToUidStream2?.[socket.id];
        const connectedToMentorUid = userConnectedTo[userUid];
        // const mentorData = stream2Mentor?.[connectedToMentorUid]?.find(
        //   (id) => id?.type === "mentor"
        // );
        // socket.to(mentorData?.soId).emit("one user leave", {
        //   userUid: userUid,
        // });
        const filterUser = stream2Mentor?.[connectedToMentorUid]?.filter(
          (id) => id.uid !== userUid
        );
        filterUser.forEach((element) => {
          if (element.type === "mentor") {
            socket.to(element?.soId).emit("one user leave", {
              userUid: userUid,
            });
          } else if (element.type === "user") {
            socket.to(element?.soId).emit("one_user_leave_userSide", {
              userUid: userUid,
            });
          }
        });
        if (filterUser.length > 0) {
          stream2Mentor[connectedToMentorUid] = filterUser;
        }

        // console.log(userConnectedTo[userUid]);
        delete userConnectedTo[userUid];
        delete userSoIdToUidStream2[socket.id];
      } else if (mentorSoIdToUid[socket.id]) {
        const mentorUid = mentorSoIdToUid?.[socket.id];

        const filterMentor = stream2Mentor?.[mentorUid]?.filter(
          (id) => id.type !== "mentor"
        );
        filterMentor?.forEach((id) => {
          socket.to(id?.soId).emit("mentor take leave");
        });
        delete stream2Mentor[mentorUid];
        delete mentorSoIdToUid[socket.id];
      }
    } catch (error) {
      new Error(error);
    }
  });

  //signal exchange start from mentor

  socket.on("Mentor send signal", async (payload) => {
    try {
      const { sendTo, mentorUid, signalData, startDate, dataType } = payload;
      const findUser = stream2Mentor?.[mentorUid]?.find(
        (id) => id.uid === sendTo
      );
      const findMentor = await stream2Mentor?.[mentorUid]?.find(
        (id) => id.type === "mentor"
      );
      // console.log(startDate);
      socket.to(findUser?.soId).emit("send to user", {
        mentorSignal: signalData,
        mentorMic: findMentor.audio,
        mentorVideo: findMentor.video,
        startDate,
        dataType,
        inClass: stream2Mentor?.[mentorUid],
      });
    } catch (error) {
      new Error(error);
    }
  });

  socket.on("User send signal to mentor", (payload) => {
    try {
      const { signal, mentorUid, userUid, dataType } = payload;
      // console.log(dataType);
      const findMentorData = stream2Mentor?.[mentorUid]?.find(
        (id) => id.uid === mentorUid
      );
      if (!dataType) {
        socket.to(findMentorData?.soId).emit("mentor get return signal", {
          userSignal: signal,
          user: userUid,
          soId: socket.id,
        });
      } else {
        socket.to(findMentorData?.soId).emit("mentor_get_screen_return", {
          userSignal: signal,
          user: userUid,
          soId: socket.id,
        });
      }
    } catch (error) {
      new Error(error);
    }
  });
  socket.on("make_true", (payload) => {
    const { userSoId } = payload;
    socket.to(userSoId).emit("make_true_loader");
  });
  socket.on("user_delete_himself", (payload) => {
    try {
      const userUid = userSoIdToUidStream2?.[socket.id];
      delete userConnectedTo[userUid];
      delete userSoIdToUidStream2?.[socket.id];
    } catch (error) {
      new Error(error);
    }
  });

  //mentor leave
  socket.on("mentor leave the class", (payload) => {
    try {
      // const { mentorUid } = payload;

      const mentorUid = mentorSoIdToUid?.[socket.id];
      const filterMentor = stream2Mentor?.[mentorUid]?.filter(
        (id) => id.type !== "mentor"
      );
      filterMentor?.forEach((id) => {
        socket.to(id?.soId).emit("mentor take leave");
      });
      delete stream2Mentor[mentorUid];
      delete mentorSoIdToUid[socket.id];
    } catch (error) {
      new Error(error);
    }
  });
  // mentor mute status
  socket.on("mentor_video_mute", async (payload) => {
    try {
      const { videoMuteStatus, mentorUid } = payload;
      const filterMentor = await stream2Mentor?.[mentorUid]?.filter(
        (id) => id.type !== "mentor"
      );
      const findMentor = await stream2Mentor?.[mentorUid]?.find(
        (id) => id.type === "mentor"
      );
      await filterMentor?.forEach((id) => {
        socket.to(id.soId).emit("video_status_send_user", { videoMuteStatus });
      });
      await filterMentor?.push({
        type: "mentor",
        audio: findMentor?.audio,
        video: !videoMuteStatus,
        screenShare: findMentor?.screenShare,
        soId: socket.id,
        uid: mentorUid,
      });
      stream2Mentor[mentorUid] = filterMentor;
    } catch (error) {
      new Error(error);
    }
  });
  socket.on("mentor_mute_mic", async (payload) => {
    try {
      const { micStatus, mentorUid } = payload;

      const filterMentor = await stream2Mentor?.[mentorUid]?.filter(
        (id) => id.type !== "mentor"
      );
      const findMentor = await stream2Mentor?.[mentorUid]?.find(
        (id) => id.type === "mentor"
      );
      await filterMentor?.forEach((id) => {
        socket.to(id.soId).emit("mic_status_send_user", { micStatus });
      });
      await filterMentor?.push({
        type: "mentor",
        audio: !micStatus,
        video: findMentor?.video,
        screenShare: findMentor?.screenShare,
        soId: socket.id,
        uid: mentorUid,
      });
      stream2Mentor[mentorUid] = filterMentor;
    } catch (error) {
      new Error(error);
    }
  });
  socket.on("rotate_signal", (payload) => {
    const { userSignal, user } = payload;
    socket.emit("mentor get return signal", {
      userSignal,
      user,
    });
  });
  //user leave
  socket.on("User leave", async (payload) => {
    try {
      const userUid = userSoIdToUidStream2?.[socket.id];
      const connectedToMentorUid = userConnectedTo[userUid];
      // const mentorData = await stream2Mentor?.[connectedToMentorUid]?.find(
      //   (id) => id?.type === "mentor"
      // );
      // socket.to(mentorData?.soId).emit("one user leave", {
      //   userUid: userUid,
      // });

      const leftUser = await stream2Mentor?.[connectedToMentorUid]?.filter(
        (id) => id.uid !== userUid
      );

      leftUser.forEach((element) => {
        if (element.type === "mentor") {
          socket.to(element?.soId).emit("one user leave", {
            userUid: userUid,
          });
        } else if (element.type === "user") {
          socket.to(element?.soId).emit("one_user_leave_userSide", {
            userUid: userUid,
          });
        }
      });

      if (leftUser?.length > 0) {
        stream2Mentor[connectedToMentorUid] = leftUser;
      }

      // console.log(userConnectedTo[userUid]);
      delete userConnectedTo[userUid];
      delete userSoIdToUidStream2[socket.id];
    } catch (error) {
      new Error(error);
    }
  });
  //share screen center

  socket.on("Mentor_screen_join", (payload) => {
    const { mentorUid } = payload;
    const findMentor = stream2Mentor[mentorUid]?.find(
      (id) => id.uid === mentorUid
    );
    const usersIn = stream2Mentor[mentorUid]?.filter(
      (id) => id.uid !== mentorUid + mentorUid
    );
    usersIn?.push({
      type: "mentor2",
      audio: findMentor?.audio,
      video: findMentor?.video,
      screenShare: true,
      soId: socket.id,
      uid: mentorUid + mentorUid,
    });
    stream2Mentor[mentorUid] = usersIn;
    socket.emit("do_screen_share");
    // socket.emit("peopleIn");
  });
  // socket.on("mentor_command_to_start", (payload) => {
  //   socket.emit("do_screen_share");
  // });

  // messaging center

  socket.on("message_Sand", async (payload) => {
    try {
      const {
        message,
        userSelf,
        mentorUid,
        senderName,
        textUid,
        imageFile,
        reaction,
        record,
      } = payload;

      const userHimself = await stream2Mentor?.[mentorUid]?.filter(
        (id) => id?.uid !== userSelf
      );

      await userHimself?.forEach((element) => {
        socket.to(element?.soId).emit("message_receive", {
          message,
          userSelf,
          senderName,
          textUid,
          imageFile,
          reaction,
          record,
        });
      });
    } catch (error) {
      new Error(error);
    }
  });
  //typing
  socket.on("text_typing", (payload) => {
    const { name, textStatus, mentorUid, userSelf } = payload;
    const userHimself = stream2Mentor?.[mentorUid]?.filter(
      (id) => id?.uid !== userSelf
    );
    userHimself?.forEach((element) => {
      socket.to(element?.soId).emit("Typing_some_One", {
        name,
        textStatus,
      });
    });
  });
});
const updateStreamRoom = {};
const allKindUserSoIdToUid = {};
const uidToRoomInfoId = {};

io.of("/updateStream").on("connection", (socket) => {
  socket.on("user_join", (payload) => {
    try {
      const { userUid, roomId, audio, video, share, handRaise } = payload;
      allKindUserSoIdToUid[socket.id] = userUid;
      uidToRoomInfoId[userUid] = roomId;
      if (updateStreamRoom[roomId]) {
        const filterUser = updateStreamRoom[roomId]?.filter(
          (id) => id?.uid !== userUid
        );

        socket.emit("create_peer_request", { filterUser });
        filterUser.push({
          uid: userUid,
          soId: socket.id,
          type: "user",
          audio,
          video,
          share,
          handRaise,
        });
        allKindUserSoIdToUid[socket.id] = userUid;
        uidToRoomInfoId[userUid] = roomId;
        updateStreamRoom[roomId] = filterUser;
        // console.log("mentor",updateStreamRoom[roomId]);
      } else {
        //new array created
        updateStreamRoom[roomId] = [];
        // console.log("new");
        updateStreamRoom[roomId].push({
          uid: userUid,
          soId: socket.id,
          type: "user",
          audio,
          video,
          share,
          handRaise,
        });
        allKindUserSoIdToUid[socket.id] = userUid;
        uidToRoomInfoId[userUid] = roomId;
      }
    } catch (error) {
      new Error(error);
    }
  });
  socket.on("create_peer_signal", (payload) => {
    try {
      const { roomId, selfId, signal, sendTo } = payload;
      const findSelfIdUser = updateStreamRoom?.[roomId]?.find(
        (id) => id?.uid === selfId
      );
      const findSendToUser = updateStreamRoom?.[roomId]?.find(
        (id) => id?.uid === sendTo
      );

      socket
        .to(findSendToUser?.soId)
        .emit("create_peer_signal_send_to_destiny", {
          signal,
          audio: findSelfIdUser?.audio,
          video: findSelfIdUser?.video,
          share: findSelfIdUser?.share,
          type: findSelfIdUser?.type,
          comeFromCreatePeerUid: findSelfIdUser?.uid,
          handRaise: findSelfIdUser?.handRaise,
        });
    } catch (error) {
      new Error(error);
    }
  });
  //mentor side
  socket.on("mentor_join", (payload) => {
    try {
      const { roomId, audio, video, share, mentorUid, handRaise } = payload;
      if (updateStreamRoom[roomId]) {
        const filterMentor = updateStreamRoom?.[roomId]?.filter(
          (id) => id?.uid !== mentorUid
        );
        socket.emit("create_peer_request_to_mentor", {
          filterMentor,
        });
        filterMentor.push({
          uid: mentorUid,
          soId: socket.id,
          type: "mentor",
          audio,
          video,
          share,
          handRaise,
        });
        updateStreamRoom[roomId] = filterMentor;
        allKindUserSoIdToUid[socket.id] = mentorUid;
        uidToRoomInfoId[mentorUid] = roomId;
      } else {
        updateStreamRoom[roomId] = [];
        updateStreamRoom[roomId].push({
          uid: mentorUid,
          soId: socket.id,
          type: "mentor",
          audio,
          video,
          share,
          handRaise,
        });
        allKindUserSoIdToUid[socket.id] = mentorUid;
        uidToRoomInfoId[mentorUid] = roomId;
      }
    } catch (error) {
      new Error(error);
    }
  });
  //add peer signal send destination
  socket.on("add_peer_signal", (payload) => {
    try {
      const { signal, sendTo, roomId, addPeerSignalSender } = payload;
      const findSender = updateStreamRoom?.[roomId]?.find(
        (id) => id?.uid === sendTo
      );
      const addPeerSignalSenderData = updateStreamRoom?.[roomId]?.find(
        (id) => id?.uid === addPeerSignalSender
      );

      socket.to(findSender?.soId).emit("add_peer_to_destiny", {
        signal,
        addPeerSignalSender,
        audio: addPeerSignalSenderData?.audio,
        video: addPeerSignalSenderData?.video,
        share: addPeerSignalSenderData?.share,
        type: addPeerSignalSenderData?.type,
        handRaise: addPeerSignalSenderData?.handRaise,
      });
    } catch (error) {
      new Error(error);
    }
  });

  socket.on("disconnect", () => {
    try {
      const gotUid = allKindUserSoIdToUid[socket.id];
      const roomId = uidToRoomInfoId[gotUid];

      //here  does not need to filter
      updateStreamRoom?.[roomId]?.forEach((element) => {
        if (element.uid !== gotUid) {
          socket.to(element.soId).emit("one_user_leave", { leaveUid: gotUid });
        }
      });
      const filterLeaveUser = updateStreamRoom?.[roomId]?.filter(
        (id) => id?.uid !== gotUid
      );
      updateStreamRoom[roomId] = filterLeaveUser;
    } catch (error) {
      new Error(error);
    }
  });
  //media status regulate
  socket.on("user_mic_status", (payload) => {
    const { micStatus, videoStatus, handRaise, userUid, roomId } = payload;

    updateStreamRoom?.[roomId]?.forEach((id) => {
      socket.to(id.soId).emit("One_user_media_status", {
        userUid,
        micStatus,
        videoStatus,
        handRaise,
      });
    });
    const findUser = updateStreamRoom?.[roomId]?.find(
      (id) => id.uid === userUid
    );
    const filterData = updateStreamRoom?.[roomId]?.filter(
      (id) => id.uid !== userUid
    );
    filterData?.push({
      uid: findUser?.uid,
      soId: findUser?.soId,
      type: findUser?.type,
      audio: micStatus,
      video: videoStatus,
      share: findUser?.share,
      handRaise: handRaise,
    });
    updateStreamRoom[roomId] = filterData;
  });
  //mentor regulate media status to other
  socket.on("mentor_regulate_media status", (payload) => {
    const {
      micStatus,
      videoStatus,
      userUid,
      roomId,
      handRaise,
      whichOne,
      mentorUid,
    } = payload;
    //
    updateStreamRoom?.[roomId]?.forEach((id) => {
      if (id?.uid === userUid) {
        //mentor force to mic on
        socket.to(id?.soId).emit("mentor_force_media", {
          userUid,
          micStatus,
          videoStatus,
          handRaise,
          whichOne,
        });
      } else if (id?.uid !== mentorUid) {
        socket.to(id.soId).emit("One_user_media_status", {
          userUid,
          micStatus,
          videoStatus,
          handRaise,
        });
      }
    });
    const findUser = updateStreamRoom?.[roomId]?.find(
      (id) => id.uid === userUid
    );
    const filterData = updateStreamRoom?.[roomId]?.filter(
      (id) => id.uid !== userUid
    );
    filterData?.push({
      uid: findUser?.uid,
      soId: findUser?.soId,
      type: findUser?.type,
      audio: micStatus,
      video: videoStatus,
      share: findUser?.share,
      handRaise: handRaise,
    });
    updateStreamRoom[roomId] = filterData;

    //
  });
  //force leave
  socket.on("one_student_leave", (payload) => {
    const { userUid, roomId } = payload;

    updateStreamRoom?.[roomId]?.forEach((element) => {
      if (element?.uid !== userUid) {
        socket.to(element.soId).emit("one_user_leave", { leaveUid: userUid });
      }
    });
    const filterLeaveUser = updateStreamRoom?.[roomId]?.filter(
      (id) => id?.uid !== userUid
    );
    updateStreamRoom[roomId] = filterLeaveUser;
  });
  //mentor leave

  socket.on("mentor_leave", (payload) => {
    const { roomId, mentorUid } = payload;
    updateStreamRoom?.[roomId]?.forEach((user) => {
      socket.to(user?.soId).emit("mentor_take_leave");
      delete allKindUserSoIdToUid[user?.soId];
      delete uidToRoomInfoId[user?.uid];
    });
    delete allKindUserSoIdToUid[socket.id];
    delete uidToRoomInfoId[mentorUid];
    delete updateStreamRoom[roomId];
  });
  //message section
  socket.on("message_send", (payload) => {
    const { roomId, uid, status, text, textUid, name } = payload;
    updateStreamRoom?.[roomId]?.forEach((element) => {
      if (element?.uid !== uid) {
        socket.to(element.soId).emit("message_send_to_other", {
          uid,
          status,
          text,
          textUid,
          name,
        });
      }
    });
  });
  //end update stream
});

//for mail route
app.get("/data", async (req, res, next) => {
  try {
    res.json({ data: "data save suc" });
  } catch (error) {
    next(error);
  }
});
// checkout
app.post("/mail", async (req, res, next) => {
  try {
    const { displayFromSideName, toEmail, body, subject, cc, bcc } = req.body;

    if (toEmail.length < 1)
      throw createError.BadRequest("You have to enter sender email... ");
    //mail property
    let transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "noreply.itqanuae@gmail.com",
        pass: "itqan@2021",
      },
    });
    //mail option
    const mailOption = {
      from: `${displayFromSideName} <foo@example.com>`,
      to: toEmail,
      subject: subject,
      text: body,
      cc,
      bcc,
    };
    const send = await transport.sendMail(mailOption);
    //mail option end
    //mail end
    res.send({ data: send });
  } catch (error) {
    console.log(error);
  }
});
//check

//mail route

//register route
// app.post("/register");

//register rote end
//error handel
app.use(async (req, res, next) => {
  next(createError.NotFound());
});

app.use((err, req, res, next) => {
  res.status(err.status || 400);
  res.send({
    error: {
      status: err.status || 400,
      message: err.message,
    },
  });
});

server.listen(process.env.PORT || 4000, () => {
  console.log("The port 4000 is ready to start....");
});
